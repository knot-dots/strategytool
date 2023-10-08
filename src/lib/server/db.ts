import { SchemaValidationError, createPool, createSqlTag } from 'slonik';
import type {
	DatabaseConnection,
	DatabasePool,
	Interceptor,
	QueryResultRow,
	SerializableValue
} from 'slonik';
import { createQueryLoggingInterceptor } from 'slonik-interceptor-query-logging';
import { z } from 'zod';
import {
	anyContainer,
	container,
	organizationalUnitContainer,
	organizationContainer,
	payloadTypes,
	predicates,
	relation,
	user,
	userRelation,
	visibility
} from '$lib/models';
import type {
	AnyContainer,
	Container,
	ModifiedContainer,
	NewContainer,
	OrganizationContainer,
	OrganizationalUnitContainer,
	PayloadType,
	Predicate,
	Relation,
	TaskPriority,
	User
} from '$lib/models';
import { createGroup, updateAccessSettings } from '$lib/server/keycloak';

const createResultParserInterceptor = (): Interceptor => {
	return {
		// If you are not going to transform results using Zod, then you should use `afterQueryExecution` instead.
		// Future versions of Zod will provide a more efficient parser when parsing without transformations.
		// You can even combine the two – use `afterQueryExecution` to validate results, and (conditionally)
		// transform results as needed in `transformRow`.
		transformRow: (executionContext, actualQuery, row) => {
			const { resultParser } = executionContext;

			if (!resultParser) {
				return row;
			}

			const validationResult = resultParser.safeParse(row);

			if (!validationResult.success) {
				throw new SchemaValidationError(
					actualQuery,
					row as SerializableValue,
					validationResult.error.issues
				);
			}

			return validationResult.data as QueryResultRow;
		}
	};
};

let pool: DatabasePool;

export async function getPool() {
	if (!pool) {
		pool = await createPool('postgres://', {
			interceptors: [createQueryLoggingInterceptor(), createResultParserInterceptor()]
		});
	}
	return pool;
}

const typeAliases = {
	anyContainer: anyContainer.omit({ relation: true, user: true }),
	container: container.omit({ relation: true, user: true }),
	organizationContainer: organizationContainer.omit({ relation: true, user: true }),
	organizationalUnitContainer: organizationalUnitContainer.omit({ relation: true, user: true }),
	relation,
	relationPath: z.object({}).catchall(z.number().int().positive().nullable()),
	revision: z.object({ revision: z.number().int().positive() }),
	user,
	userRelation,
	userRelationWithObject: userRelation.extend({
		object: z.number().int().positive()
	}),
	void: z.object({}).strict()
};

const sql = createSqlTag({ typeAliases });

export function createContainer(container: NewContainer) {
	return (connection: DatabaseConnection) => {
		return connection.transaction(async (txConnection) => {
			let organizationGuid;
			let organizationalUnitGuid;

			if (container.payload.type === payloadTypes.enum.organization) {
				organizationGuid = await createGroup(container.payload.name);
				await updateAccessSettings(organizationGuid);
			} else if (container.payload.type === payloadTypes.enum.organizational_unit) {
				organizationalUnitGuid = await createGroup(container.payload.name);
				await updateAccessSettings(organizationalUnitGuid);
			}

			const containerResult = organizationGuid
				? await txConnection.one(sql.typeAlias('anyContainer')`
					INSERT INTO container (guid, organization, payload, realm)
					VALUES (
						${organizationGuid},
						${organizationGuid},
						${sql.jsonb(<SerializableValue>container.payload)},
						${container.realm}
					)
					RETURNING *
				`)
				: organizationalUnitGuid
				? await txConnection.one(sql.typeAlias('anyContainer')`
					INSERT INTO container (guid, organization, payload, realm)
					VALUES (
						${organizationalUnitGuid},
						${container.organization},
						${sql.jsonb(<SerializableValue>container.payload)},
						${container.realm}
					)
					RETURNING *
				`)
				: await txConnection.one(sql.typeAlias('anyContainer')`
					INSERT INTO container (organization, organizational_unit, payload, realm)
					VALUES (
						${container.organization},
						${container.organizational_unit},
						${sql.jsonb(<SerializableValue>container.payload)},
						${container.realm}
					)
					RETURNING *
      `);

			const userValues = container.user.map((u) => [
				containerResult.revision,
				u.predicate,
				u.subject
			]);
			const userResult = await txConnection.any(sql.typeAlias('userRelation')`
				INSERT INTO container_user (object, predicate, subject)
				SELECT *
				FROM ${sql.unnest(userValues, ['int4', 'text', 'uuid'])}
				RETURNING predicate, subject
      `);

			const relationValues = container.relation.map((r, position) => [
				r.object ?? containerResult.revision,
				position,
				r.predicate,
				r.subject ?? containerResult.revision
			]);
			const relationResult = await txConnection.any(sql.typeAlias('relation')`
				INSERT INTO container_relation (object, position, predicate, subject)
				SELECT *
				FROM ${sql.unnest(relationValues, ['int4', 'int4', 'text', 'int4'])}
				ON CONFLICT DO NOTHING
      `);

			return { ...containerResult, relation: relationResult, user: userResult };
		});
	};
}

export function updateContainer(container: ModifiedContainer) {
	return (connection: DatabaseConnection) => {
		return connection.transaction(async (txConnection) => {
			const previousRevision = await getContainerByGuid(container.guid)(txConnection);

			await txConnection.query(sql.typeAlias('void')`
				UPDATE container
				SET valid_currently = false
				WHERE guid = ${container.guid}
			`);

			const containerResult = await txConnection.one(sql.typeAlias('anyContainer')`
				INSERT INTO container (guid, organization, organizational_unit, payload, realm)
				VALUES (
					${container.guid},
					${container.organization},
					${container.organizational_unit},
					${sql.jsonb(<SerializableValue>container.payload)},
					${container.realm}
				)
				RETURNING *
      `);

			const userValues = container.user.map((u) => [
				containerResult.revision,
				u.predicate,
				u.subject
			]);
			const userResult = await txConnection.many(sql.typeAlias('userRelation')`
				INSERT INTO container_user (object, predicate, subject)
				SELECT *
				FROM ${sql.unnest(userValues, ['int4', 'text', 'uuid'])}
				RETURNING predicate, subject
      `);

			const relationValues = container.relation.map((r) => [
				r.object ?? containerResult.revision,
				r.position,
				r.predicate,
				r.subject ?? containerResult.revision
			]);
			await txConnection.query(sql.typeAlias('void')`
				INSERT INTO container_relation (object, position, predicate, subject)
				SELECT *
				FROM ${sql.unnest(relationValues, ['int4', 'int4', 'text', 'int4'])}
				ON CONFLICT DO NOTHING
      `);

			// Create new records for relations having this container as object.
			await txConnection.query(sql.typeAlias('void')`
				INSERT INTO container_relation (object, position, predicate, subject)
				SELECT DISTINCT ON (o.guid, cr.predicate, cr.subject) ${containerResult.revision}, cr.position, cr.predicate, cr.subject
				FROM container_relation cr
				JOIN container o ON o.revision = cr.object
				JOIN container s ON s.revision = cr.subject AND s.valid_currently
				WHERE o.guid = ${container.guid}
				ORDER BY o.guid, cr.predicate, cr.subject, cr.object DESC
      `);

			if (container.payload.type == payloadTypes.enum.strategy) {
				if (
					container.organizational_unit &&
					previousRevision.organizational_unit != container.organizational_unit
				) {
					await bulkUpdateOrganizationalUnit(
						previousRevision,
						container.organizational_unit
					)(txConnection);
				}
				if (previousRevision.organization != container.organization) {
					await bulkUpdateOrganization(previousRevision, container.organization)(txConnection);
				}
			}

			return { ...containerResult, user: userResult };
		});
	};
}

export function deleteContainer(container: AnyContainer) {
	return (connection: DatabaseConnection) => {
		return connection.transaction(async (txConnection) => {
			await txConnection.query(sql.typeAlias('void')`
				UPDATE container
				SET valid_currently = false
				WHERE guid = ${container.guid}
			`);

			const deletedRevision = await txConnection.oneFirst(sql.typeAlias('revision')`
				INSERT INTO container (deleted, guid, organization, organizational_unit, payload, realm)
				SELECT true, guid, organization, organizational_unit, payload, realm FROM container
				WHERE revision = ${container.revision}
				RETURNING revision
			`);

			const userValues = container.user.map((u) => [deletedRevision, u.predicate, u.subject]);
			await txConnection.query(sql.typeAlias('void')`
				INSERT INTO container_user (object, predicate, subject)
				SELECT *
				FROM ${sql.unnest(userValues, ['int4', 'text', 'uuid'])}
      `);
		});
	};
}

export function updateContainerRelationPosition(relation: Relation[]) {
	return async (connection: DatabaseConnection) => {
		return connection.transaction(async (txConnection) => {
			await Promise.all(
				relation.map(({ object, subject }, position) =>
					txConnection.query(sql.typeAlias('void')`
						UPDATE container_relation SET position = ${position} WHERE object = ${object} AND subject = ${subject}
					`)
				)
			);
		});
	};
}

export function getContainerByGuid(guid: string) {
	return async (connection: DatabaseConnection): Promise<AnyContainer> => {
		const containerResult = await connection.one(sql.typeAlias('anyContainer')`
			SELECT *
			FROM container
			WHERE guid = ${guid}
				AND valid_currently
				AND NOT deleted
		`);
		const userResult = await connection.any(sql.typeAlias('userRelationWithObject')`
			SELECT *
			FROM container_user
			WHERE object = ${containerResult.revision}
		`);
		const relationResult = await connection.any(sql.typeAlias('relation')`
			SELECT cr.*
			FROM container_relation cr
			JOIN container co ON cr.object = co.revision AND co.valid_currently
			JOIN container cs ON cr.subject = cs.revision AND cs.valid_currently
			WHERE subject = ${containerResult.revision} OR object = ${containerResult.revision}
			ORDER BY position
		`);
		return {
			...containerResult,
			relation: relationResult.map((r) => r),
			user: userResult.map(({ predicate, subject }) => ({ predicate, subject }))
		};
	};
}

export function getAllContainerRevisionsByGuid(guid: string) {
	return async (connection: DatabaseConnection): Promise<AnyContainer[]> => {
		const containerResult = await connection.many(sql.typeAlias('anyContainer')`
			SELECT *
			FROM container
			WHERE guid = ${guid}
				AND NOT deleted
			ORDER BY valid_from;
		`);

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult = await connection.any(sql.typeAlias('userRelationWithObject')`
			SELECT *
			FROM container_user
			WHERE object IN (${revisions})
		`);

		const relationResult = await connection.any(sql.typeAlias('relation')`
			SELECT cr.*
			FROM container_relation cr
			JOIN container co ON cr.object = co.revision AND co.valid_currently
			JOIN container cs ON cr.subject = cs.revision AND cs.valid_currently
			WHERE subject IN (${revisions}) OR object IN (${revisions})
			ORDER BY position
		`);

		return containerResult.map((c) => ({
			...c,
			relation: relationResult.filter(
				({ object, subject }) => object === c.revision || subject === c.revision
			),
			user: userResult
				.filter((u) => u.object === c.revision)
				.map(({ predicate, subject }) => ({ predicate, subject }))
		}));
	};
}

function prepareWhereCondition(filters: {
	categories?: string[];
	organizations?: string[];
	organizationalUnits?: string[];
	strategyTypes?: string[];
	terms?: string;
	topics?: string[];
	type?: PayloadType[];
}) {
	const conditions = [
		sql.fragment`valid_currently`,
		sql.fragment`NOT deleted`,
		sql.fragment`payload->>'type' NOT IN ('organization', 'organizational_unit')`
	];
	if (filters.categories?.length) {
		conditions.push(sql.fragment`payload->'category' ?| ${sql.array(filters.categories, 'text')}`);
	}
	if (filters.organizations?.length) {
		conditions.push(
			sql.fragment`organization IN (${sql.join(filters.organizations, sql.fragment`, `)})`
		);
	}
	if (filters.organizationalUnits?.length) {
		conditions.push(
			sql.fragment`organizational_unit IN (${sql.join(
				filters.organizationalUnits,
				sql.fragment`, `
			)})`
		);
	}
	if (filters.strategyTypes?.length) {
		conditions.push(
			sql.fragment`payload->>'strategyType' IN (${sql.join(
				filters.strategyTypes,
				sql.fragment`, `
			)})`
		);
	}
	if (filters.terms?.trim()) {
		conditions.push(
			sql.fragment`to_tsquery('german', ${filters.terms
				.trim()
				.split(' ')
				.map((t) => `${t}:*`)
				.join(' & ')}) @@ jsonb_to_tsvector('german', payload, '["string", "numeric"]')`
		);
	}
	if (filters.topics?.length) {
		conditions.push(sql.fragment`payload->'topic' ?| ${sql.array(filters.topics, 'text')}`);
	}
	if (filters.type?.length) {
		conditions.push(
			sql.fragment`payload->>'type' IN (${sql.join(filters.type, sql.fragment`, `)})`
		);
	}
	return sql.join(conditions, sql.fragment` AND `);
}

function prepareOrderByExpression(sort: string) {
	let order_by = sql.fragment`valid_from DESC`;
	if (sort == 'alpha') {
		order_by = sql.fragment`payload->>'title'`;
	}
	return order_by;
}

export function getManyContainers(
	organizations: string[],
	filters: {
		categories?: string[];
		organizationalUnits?: string[];
		strategyTypes?: string[];
		terms?: string;
		topics?: string[];
		type?: PayloadType[];
	},
	sort: string
) {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
		const containerResult = await connection.any(sql.typeAlias('container')`
			SELECT *
			FROM container
			WHERE ${prepareWhereCondition({ ...filters, organizations })}
			ORDER BY ${prepareOrderByExpression(sort)};
    `);

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userRelationWithObject')`
						SELECT *
						FROM container_user
						WHERE object IN (${revisions})
					`)
				: [];

		const relationResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('relation')`
						SELECT cr.*
						FROM container_relation cr
						JOIN container co ON cr.object = co.revision AND co.valid_currently
						JOIN container cs ON cr.subject = cs.revision AND cs.valid_currently
						WHERE object IN (${revisions}) OR subject IN (${revisions})
						ORDER BY position
			`)
				: [];

		return containerResult.map((c) => ({
			...c,
			relation: relationResult.filter(
				({ object, subject }) => object === c.revision || subject === c.revision
			),
			user: userResult
				.filter((u) => u.object === c.revision)
				.map(({ predicate, subject }) => ({ predicate, subject }))
		}));
	};
}

export function getManyOrganizationContainers(
	filters: { default?: boolean; organizationCategories?: string[] },
	sort: string
) {
	return async (connection: DatabaseConnection): Promise<OrganizationContainer[]> => {
		const conditions = [
			sql.fragment`valid_currently`,
			sql.fragment`NOT deleted`,
			sql.fragment`payload->>'type' = ${payloadTypes.enum.organization}`
		];

		if (filters.default !== undefined) {
			conditions.push(sql.fragment`payload->>'default' = ${filters.default}`);
		}

		if (filters.organizationCategories?.length) {
			conditions.push(
				sql.fragment`payload->>'organizationCategory' IN (${sql.join(
					filters.organizationCategories,
					sql.fragment`, `
				)})`
			);
		}

		let orderBy = sql.fragment`valid_from DESC`;
		if (sort == 'alpha') {
			orderBy = sql.fragment`payload->>'default' DESC, payload->>'name'`;
		}

		const containerResult = await connection.any(sql.typeAlias('organizationContainer')`
			SELECT *
			FROM container
			WHERE ${sql.join(conditions, sql.fragment` AND `)}
			ORDER BY ${orderBy};
    `);

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userRelationWithObject')`
						SELECT *
						FROM container_user
						WHERE object IN (${revisions})
					`)
				: [];

		return containerResult.map((c) => ({
			...c,
			relation: [],
			user: userResult
				.filter((u) => u.object === c.revision)
				.map(({ predicate, subject }) => ({ predicate, subject }))
		}));
	};
}

export function getManyOrganizationalUnitContainers(filters: { organization?: string }) {
	return async (connection: DatabaseConnection): Promise<OrganizationalUnitContainer[]> => {
		const conditions = [
			sql.fragment`valid_currently`,
			sql.fragment`NOT deleted`,
			sql.fragment`payload->>'type' = ${payloadTypes.enum.organizational_unit}`
		];
		if (filters.organization) {
			conditions.push(sql.fragment`organization = ${filters.organization}`);
		}

		const containerResult = await connection.any(sql.typeAlias('organizationalUnitContainer')`
			SELECT *
			FROM container
			WHERE ${sql.join(conditions, sql.fragment` AND `)}
			ORDER BY payload->>'level', payload->>'name'
    `);

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userRelationWithObject')`
						SELECT *
						FROM container_user
						WHERE object IN (${revisions})
					`)
				: [];

		const relationResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('relation')`
						SELECT cr.*
						FROM container_relation cr
						JOIN container co ON cr.object = co.revision AND co.valid_currently
						JOIN container cs ON cr.subject = cs.revision AND cs.valid_currently
						WHERE object IN (${revisions}) OR subject IN (${revisions})
						ORDER BY position
			`)
				: [];

		return containerResult.map((c) => ({
			...c,
			relation: relationResult.filter(
				({ object, subject }) => object === c.revision || subject === c.revision
			),
			user: userResult
				.filter((u) => u.object === c.revision)
				.map(({ predicate, subject }) => ({ predicate, subject }))
		}));
	};
}

export function getManyTaskContainers(filters: {
	measure?: number;
	organization?: string;
	organizationalUnits?: string[];
	taskCategories?: string[];
	terms?: string;
}) {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
		const conditions = [
			sql.fragment`valid_currently`,
			sql.fragment`NOT deleted`,
			sql.fragment`payload->>'type' = ${payloadTypes.enum['internal_objective.task']}`
		];

		if (filters.organization) {
			conditions.push(sql.fragment`organization = ${filters.organization}`);
		}

		if (filters.organizationalUnits?.length) {
			conditions.push(
				sql.fragment`organizational_unit IN (${sql.join(
					filters.organizationalUnits,
					sql.fragment`, `
				)})`
			);
		}

		if (filters.taskCategories?.length) {
			conditions.push(
				sql.fragment`payload->>'taskCategory' IN (${sql.join(
					filters.taskCategories,
					sql.fragment`, `
				)})`
			);
		}

		if (filters.terms?.trim()) {
			conditions.push(
				sql.fragment`to_tsquery('german', ${filters.terms
					.trim()
					.split(' ')
					.map((t) => `${t}:*`)
					.join(' & ')}) @@ jsonb_to_tsvector('german', payload, '["string", "numeric"]')`
			);
		}

		let containerResult;

		if (filters.measure) {
			containerResult = await connection.any(sql.typeAlias('container')`
			SELECT c.*
			FROM container c
			JOIN container_relation cr ON c.revision = cr.subject
				AND cr.predicate = 'is-part-of-measure'
				AND cr.object = ${filters.measure}
      LEFT JOIN task_priority tp ON c.guid = tp.task
			WHERE ${sql.join(conditions, sql.fragment` AND `)}
			ORDER BY tp.priority;
		`);
		} else {
			containerResult = await connection.any(sql.typeAlias('container')`
				SELECT *
				FROM container c
				LEFT JOIN task_priority tp ON c.guid = tp.task
				WHERE ${sql.join(conditions, sql.fragment` AND `)}
				ORDER BY tp.priority
			`);
		}

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userRelationWithObject')`
					SELECT *
					FROM container_user
					WHERE object IN (${revisions})
				`)
				: [];

		const relationResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('relation')`
					SELECT cr.*
					FROM container_relation cr
					JOIN container co ON cr.object = co.revision AND co.valid_currently
					JOIN container cs ON cr.subject = cs.revision AND cs.valid_currently
					WHERE object IN (${revisions})
						OR subject IN (${revisions})
					ORDER BY position
				`)
				: [];

		return containerResult.map((c) => ({
			...c,
			relation: relationResult.filter(
				({ object, subject }) => object === c.revision || subject === c.revision
			),
			user: userResult
				.filter((u) => u.object === c.revision)
				.map(({ predicate, subject }) => ({ predicate, subject }))
		}));
	};
}

export function getAllRelatedOrganizationalUnitContainers(guid: string) {
	return async (connection: DatabaseConnection): Promise<OrganizationalUnitContainer[]> => {
		const revision = await connection.oneFirst(sql.typeAlias('revision')`
			SELECT revision FROM container WHERE guid = ${guid} AND valid_currently AND NOT deleted
		`);

		const relationPathResult = await connection.any(sql.typeAlias('relationPath')`
			SELECT s1.subject AS r1, s1.object AS r2, s2.subject AS r3, s2.object AS r4, s3.subject AS r5, s3.object AS r6
			FROM
			(
				SELECT cr.subject, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' = ${payloadTypes.enum.organizational_unit} AND cr.predicate = ${predicates.enum['is-part-of']}
				WHERE c.valid_currently
			) s1
			FULL JOIN
			(
				SELECT cr.subject, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' = ${payloadTypes.enum.organizational_unit} AND cr.predicate = ${predicates.enum['is-part-of']}
				WHERE c.valid_currently
			) s2 ON s1.object = s2.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' = ${payloadTypes.enum.organizational_unit} AND cr.predicate = ${predicates.enum['is-part-of']}
				WHERE c.valid_currently
			) s3 ON s2.object = s3.subject
			WHERE s1.subject = ${revision}
				OR s1.object = ${revision}
				OR s2.subject = ${revision}
				OR s2.object = ${revision}
				OR s3.subject = ${revision}
				OR s3.object = ${revision}
		`);

		const containerResult = await connection.any(sql.typeAlias('organizationalUnitContainer')`
			SELECT *
			FROM container
			WHERE revision IN (${sql.join(
				relationPathResult
					.map((r) => Object.values(r))
					.flat()
					.concat([revision]),
				sql.fragment`, `
			)})
				AND valid_currently
			  AND NOT DELETED
			ORDER BY payload->>'level', payload->>'name'
		`);
		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userRelationWithObject')`
                  SELECT *
                  FROM container_user
                  WHERE object IN (${revisions})
				`)
				: [];

		const relationResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('relation')`
                  SELECT cr.*
                  FROM container_relation cr
                           JOIN container co
                                ON cr.object = co.revision AND co.valid_currently
                           JOIN container cs
                                ON cr.subject = cs.revision AND cs.valid_currently
                  WHERE object IN (${revisions})
                     OR subject IN (${revisions})
                  ORDER BY position
				`)
				: [];

		return containerResult.map((c) => ({
			...c,
			relation: relationResult.filter(
				({ object, subject }) => object === c.revision || subject === c.revision
			),
			user: userResult
				.filter((u) => u.object === c.revision)
				.map(({ predicate, subject }) => ({ predicate, subject }))
		}));
	};
}

export function maybePartOf(organizationOrOrganizationalUnit: string, containerType: PayloadType) {
	return async (connection: DatabaseConnection): Promise<AnyContainer[]> => {
		let candidateType: PayloadType[];
		if (containerType == 'model') {
			candidateType = ['strategy'];
		} else if (containerType == 'strategic_goal') {
			candidateType = ['model'];
		} else if (containerType == 'operational_goal') {
			candidateType = ['strategic_goal'];
		} else if (containerType == 'measure') {
			candidateType = ['operational_goal'];
		} else if (containerType == 'text') {
			candidateType = ['model', 'operational_goal', 'strategic_goal', 'strategy'];
		} else if (containerType == 'internal_objective.vision') {
			candidateType = ['internal_objective.internal_strategy'];
		} else if (containerType == 'internal_objective.strategic_goal') {
			candidateType = ['internal_objective.vision'];
		} else if (containerType == 'internal_objective.milestone') {
			candidateType = ['internal_objective.strategic_goal'];
		} else if (containerType == 'internal_objective.task') {
			candidateType = ['internal_objective.milestone'];
		} else if (containerType == 'organizational_unit') {
			candidateType = ['organizational_unit'];
		} else {
			return [];
		}

		const containerResult = await connection.any(sql.typeAlias('anyContainer')`
			SELECT *
			FROM container
			WHERE (organization = ${organizationOrOrganizationalUnit} OR organizational_unit = ${organizationOrOrganizationalUnit})
			  AND payload->>'type' IN (${sql.join(candidateType, sql.fragment`,`)})
			  AND valid_currently
				AND NOT deleted
			ORDER BY payload->>'name' ASC, payload->>'title' ASC
		`);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userRelationWithObject')`
						SELECT *
						FROM container_user
						WHERE object IN (${sql.join(
							containerResult.map((c) => c.revision),
							sql.fragment`, `
						)})
					`)
				: [];

		return containerResult.map((c) => ({
			...c,
			relation: [],
			user: userResult
				.filter((u) => u.object === c.revision)
				.map(({ predicate, subject }) => ({ predicate, subject }))
		}));
	};
}

export function getAllRelatedContainers(
	organizations: string[],
	guid: string,
	relations: string[],
	filters: {
		categories?: string[];
		organizationalUnits?: string[];
		strategyTypes?: string[];
		terms?: string;
		topics?: string[];
	},
	sort: string
) {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
		const revision = await connection.oneFirst(sql.typeAlias('revision')`
			SELECT revision FROM container WHERE guid = ${guid} AND valid_currently AND NOT deleted
		`);

		const isPartOfResult = relations.includes('hierarchical')
			? await connection.any(sql.typeAlias('relationPath')`
			SELECT s1.subject AS r1, s1.object AS r2, s2.subject AS r3, s2.object AS r4, s3.subject AS r5, s3.object AS r6, s4.subject AS r7, s4.object AS r8
			FROM
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('measure', 'text') AND cr.predicate = ${predicates.enum['is-part-of']}
				WHERE c.valid_currently
			) s1
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('operational_goal', 'text') AND cr.predicate = ${predicates.enum['is-part-of']}
				WHERE c.valid_currently
			) s2 ON s1.object = s2.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('strategic_goal', 'text') AND cr.predicate = ${predicates.enum['is-part-of']}
				WHERE c.valid_currently
			) s3 ON s2.object = s3.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('model', 'text') AND cr.predicate = ${predicates.enum['is-part-of']}
				WHERE c.valid_currently
			) s4 ON s3.object = s4.subject
			WHERE s1.subject = ${revision}
				OR s1.object = ${revision}
				OR s2.subject = ${revision}
				OR s2.object = ${revision}
				OR s3.subject = ${revision}
				OR s3.object = ${revision}
				OR s4.subject = ${revision}
			  OR s4.object = ${revision}
		`)
			: [];

		const otherRelationResult = relations.includes('other')
			? await connection.any(sql.typeAlias('relationPath')`
			SELECT cr.subject, cr.object
			FROM container_relation cr
			JOIN container cs ON cs.revision = cr.subject
				AND cs.valid_currently
				AND cr.predicate NOT IN (${predicates.enum['is-part-of']}, ${predicates.enum['is-part-of-measure']})
			JOIN container co ON co.revision = cr.object
				AND co.valid_currently
				AND cr.predicate NOT IN (${predicates.enum['is-part-of']}, ${predicates.enum['is-part-of-measure']})
			WHERE cs.revision = ${revision} OR co.revision = ${revision}
		`)
			: [];

		const containerResult = await connection.any(sql.typeAlias('container')`
			SELECT *
			FROM container
			WHERE revision IN (${sql.join(
				isPartOfResult
					.concat(otherRelationResult)
					.map((r) => Object.values(r))
					.flat()
					.concat([revision]),
				sql.fragment`, `
			)})
				AND ${prepareWhereCondition({ ...filters, organizations })}
			ORDER BY ${prepareOrderByExpression(sort)}
		`);

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userRelationWithObject')`
						SELECT *
						FROM container_user
						WHERE object IN (${revisions})
					`)
				: [];

		const relationResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('relation')`
						SELECT cr.*
						FROM container_relation cr
						JOIN container co ON cr.object = co.revision AND co.valid_currently
						JOIN container cs ON cr.subject = cs.revision AND cs.valid_currently
						WHERE object IN (${revisions}) OR subject IN (${revisions})
						ORDER BY position
			`)
				: [];

		return containerResult.map((c) => ({
			...c,
			relation: relationResult.filter(
				({ object, subject }) => object === c.revision || subject === c.revision
			),
			user: userResult
				.filter((u) => u.object === c.revision)
				.map(({ predicate, subject }) => ({ predicate, subject }))
		}));
	};
}

export function getAllRelatedContainersByStrategyType(
	organizations: string[],
	strategyTypes: string[],
	filters: {
		categories?: string[];
		organizationalUnits?: string[];
		terms?: string;
		topics?: string[];
	},
	sort: string
) {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
		const relationPathResult = await connection.any(sql.typeAlias('relationPath')`
			SELECT s1.subject AS r1, s1.object AS r2, s2.subject AS r3, s2.object AS r4, s3.subject AS r5, s3.object AS r6, s4.subject AS r7, s4.object AS r8
			FROM
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' = 'measure' AND cr.predicate = ${
					predicates.enum['is-part-of']
				}
				WHERE c.valid_currently
			) s1
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' = 'operational_goal' AND cr.predicate = ${
					predicates.enum['is-part-of']
				}
				WHERE c.valid_currently
			) s2 ON s1.object = s2.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' = 'strategic_goal' AND cr.predicate = ${
					predicates.enum['is-part-of']
				}
				WHERE c.valid_currently
			) s3 ON s2.object = s3.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' = 'model' AND cr.predicate = ${
					predicates.enum['is-part-of']
				}
				WHERE c.valid_currently
			) s4 ON s3.object = s4.subject
			JOIN container c ON s4.object = c.revision
				WHERE c.payload->>'strategyType' IN (${sql.join(strategyTypes, sql.fragment`, `)})
		`);

		const containerResult =
			relationPathResult.length > 0
				? await connection.any(sql.typeAlias('container')`
						SELECT *
						FROM container
						WHERE revision IN (${sql.join(
							relationPathResult.map((r) => Object.values(r)).flat(),
							sql.fragment`, `
						)})
							AND ${prepareWhereCondition({ ...filters, organizations })}
						ORDER BY ${prepareOrderByExpression(sort)}
		`)
				: [];

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userRelationWithObject')`
						SELECT *
						FROM container_user
						WHERE object IN (${revisions})
					`)
				: [];

		const relationResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('relation')`
						SELECT cr.*
						FROM container_relation cr
						JOIN container co ON cr.object = co.revision AND co.valid_currently
						JOIN container cs ON cr.subject = cs.revision AND cs.valid_currently
						WHERE object IN (${revisions}) OR subject IN (${revisions})
						ORDER BY position
			`)
				: [];

		return containerResult.map((c) => ({
			...c,
			relation: relationResult.filter(
				({ object, subject }) => object === c.revision || subject === c.revision
			),
			user: userResult
				.filter((u) => u.object === c.revision)
				.map(({ predicate, subject }) => ({ predicate, subject }))
		}));
	};
}

export function getAllContainersWithIndicatorContributions(organizations: string[]) {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
		const containerResult = await connection.any(sql.typeAlias('container')`
			SELECT *
			FROM container
			WHERE ${prepareWhereCondition({ organizations })}
				AND (
					payload->>'indicatorContribution' IS NOT NULL
					OR payload->>'indicatorContribution' != '{}'
				)
		`);
		return containerResult.map((c) => ({
			...c,
			relation: [],
			user: []
		}));
	};
}

export function getAllContainersRelatedToMeasure(
	revision: number,
	filters: { terms?: string; type?: PayloadType[] },
	sort: string
) {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
		const containerResult = await connection.any(sql.typeAlias('container')`
			SELECT c.*
			FROM container c
			JOIN container_relation cr ON c.revision = cr.subject
				AND cr.predicate = 'is-part-of-measure'
				AND cr.object = ${revision}
			WHERE ${prepareWhereCondition(filters)}
			ORDER BY ${prepareOrderByExpression(sort)};
		`);

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userRelationWithObject')`
						SELECT *
						FROM container_user
						WHERE object IN (${revisions})
					`)
				: [];

		const relationResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('relation')`
						SELECT cr.*
						FROM container_relation cr
						JOIN container co ON cr.object = co.revision AND co.valid_currently
						JOIN container cs ON cr.subject = cs.revision AND cs.valid_currently
						WHERE object IN (${revisions}) OR subject IN (${revisions})
						ORDER BY position
			`)
				: [];

		return containerResult.map((c) => ({
			...c,
			relation: relationResult.filter(
				({ object, subject }) => object === c.revision || subject === c.revision
			),
			user: userResult
				.filter((u) => u.object === c.revision)
				.map(({ predicate, subject }) => ({ predicate, subject }))
		}));
	};
}

export function getAllRelatedInternalObjectives(guid: string, relations: string[], sort: string) {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
		const revision = await connection.oneFirst(sql.typeAlias('revision')`
			SELECT revision FROM container WHERE guid = ${guid} AND valid_currently AND NOT deleted
		`);

		const relationPathResult = relations.includes('hierarchical')
			? await connection.any(sql.typeAlias('relationPath')`
			SELECT s1.subject AS r1, s1.object AS r2, s2.subject AS r3, s2.object AS r4, s3.subject AS r5, s3.object AS r6, s4.subject AS r7, s4.object AS r8, s5.subject AS r9, s5.object AS r10
			FROM
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('internal_objective.task') AND cr.predicate = ${predicates.enum['is-part-of']}
				WHERE c.valid_currently
			) s1
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('internal_objective.milestone') AND cr.predicate = ${predicates.enum['is-part-of']}
				WHERE c.valid_currently
			) s2 ON s1.object = s2.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('internal_objective.strategic_goal') AND cr.predicate = ${predicates.enum['is-part-of']}
				WHERE c.valid_currently
			) s3 ON s2.object = s3.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('internal_objective.vision') AND cr.predicate = ${predicates.enum['is-part-of']}
				WHERE c.valid_currently
			) s4 ON s3.object = s4.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('internal_objective.internal_strategy') AND cr.predicate = ${predicates.enum['is-part-of-measure']}
				WHERE c.valid_currently
			) s5 ON s4.object = s5.subject
			WHERE s1.subject = ${revision}
				OR s1.object = ${revision}
				OR s2.subject = ${revision}
				OR s2.object = ${revision}
				OR s3.subject = ${revision}
				OR s3.object = ${revision}
				OR s4.subject = ${revision}
				OR s4.object = ${revision}
		`)
			: [];

		const otherRelationResult = relations.includes('other')
			? await connection.any(sql.typeAlias('relationPath')`
			SELECT cr.subject, cr.object
			FROM container_relation cr
			JOIN container cs ON cs.revision = cr.subject
				AND cs.valid_currently
				AND cr.predicate NOT IN (${predicates.enum['is-part-of']}, ${predicates.enum['is-part-of-measure']})
			JOIN container co ON co.revision = cr.object
				AND co.valid_currently
				AND cr.predicate NOT IN (${predicates.enum['is-part-of']}, ${predicates.enum['is-part-of-measure']})
			WHERE cs.revision = ${revision} OR co.revision = ${revision}
		`)
			: [];

		const containerResult = await connection.any(sql.typeAlias('container')`
			SELECT *
			FROM container
			WHERE revision IN (${sql.join(
				relationPathResult
					.concat(otherRelationResult)
					.map((r) => Object.values(r))
					.flat()
					.concat([revision]),
				sql.fragment`, `
			)})
				AND valid_currently
				AND NOT deleted
			ORDER BY ${prepareOrderByExpression(sort)}
		`);

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userRelationWithObject')`
						SELECT *
						FROM container_user
						WHERE object IN (${revisions})
					`)
				: [];

		const relationResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('relation')`
						SELECT cr.*
						FROM container_relation cr
						JOIN container co ON cr.object = co.revision AND co.valid_currently
						JOIN container cs ON cr.subject = cs.revision AND cs.valid_currently
						WHERE object IN (${revisions}) OR subject IN (${revisions})
						ORDER BY position
			`)
				: [];

		return containerResult.map((c) => ({
			...c,
			relation: relationResult.filter(
				({ object, subject }) => object === c.revision || subject === c.revision
			),
			user: userResult
				.filter((u) => u.object === c.revision)
				.map(({ predicate, subject }) => ({ predicate, subject }))
		}));
	};
}

export function createUser(user: User) {
	return async (connection: DatabaseConnection) => {
		return await connection.one(sql.typeAlias('user')`
			INSERT INTO "user" (display_name, realm, guid)
			VALUES (${user.display_name}, ${user.realm}, ${user.guid})
			RETURNING *
		`);
	};
}

export function createOrUpdateUser(user: User) {
	return async (connection: DatabaseConnection) => {
		return await connection.one(sql.typeAlias('user')`
			INSERT INTO "user" (display_name, realm, guid)
			VALUES (${user.display_name}, ${user.realm}, ${user.guid})
			ON CONFLICT (guid) DO UPDATE SET display_name = ${user.display_name}
			RETURNING *
		`);
	};
}

export function getUser(subject: string) {
	return async (connection: DatabaseConnection) => {
		return await connection.one(sql.typeAlias('user')`
			SELECT * FROM "user" WHERE guid = ${subject}
		`);
	};
}

export function getAllRelatedUsers(guid: string, predicates: Predicate[]) {
	return async (connection: DatabaseConnection) => {
		return await connection.any(sql.typeAlias('user')`
			SELECT DISTINCT u.*
			FROM "user" u
			JOIN container_user cu ON u.guid = cu.subject AND cu.predicate IN (${sql.join(
				predicates,
				sql.fragment`, `
			)})
			JOIN container c ON cu.object = c.revision AND c.valid_currently
			WHERE c.guid = ${guid}
			ORDER BY display_name
		`);
	};
}

export function getAllMembershipRelationsOfUser(guid: string) {
	return async (connection: DatabaseConnection) => {
		return await connection.any(sql.type(
			z.object({ predicate: predicates, object: z.string().uuid() })
		)`
			SELECT cu.predicate, c.guid AS object
			FROM container_user cu
			JOIN container c ON cu.object = c.revision AND c.valid_currently
			WHERE subject = ${guid};
		`);
	};
}

export function bulkUpdateOrganization(container: AnyContainer, organization: string) {
	return async (connection: DatabaseConnection) => {
		return connection.transaction(async (txConnection) => {
			const containerResult = await getAllRelatedContainers(
				[container.organization],
				container.guid,
				['hierarchical'],
				{},
				''
			)(txConnection);
			if (containerResult.length) {
				await txConnection.query(sql.typeAlias('void')`
        	UPDATE container
        	SET organization = ${organization}
        	WHERE guid IN (${sql.join(
						containerResult.map(({ guid }) => guid),
						sql.fragment`, `
					)})
				`);
			}
		});
	};
}

export function bulkUpdateOrganizationalUnit(container: AnyContainer, organizationalUnit: string) {
	return async (connection: DatabaseConnection) => {
		return connection.transaction(async (txConnection) => {
			const containerResult = await getAllRelatedContainers(
				[container.organization],
				container.guid,
				['hierarchical'],
				{},
				''
			)(txConnection);
			if (containerResult.length) {
				await txConnection.query(sql.typeAlias('void')`
					UPDATE container
					SET organizational_unit = ${organizationalUnit}
					WHERE guid IN (${sql.join(
						containerResult.map(({ guid }) => guid),
						sql.fragment`, `
					)})
				`);
			}
		});
	};
}

export function createOrUpdateTaskPriority(taskPriority: TaskPriority[]) {
	return async (connection: DatabaseConnection) => {
		const taskPriorityValues = taskPriority.map(({ priority, task }) => [priority, task]);
		const tasks = taskPriority.map(({ task }) => task);

		return connection.transaction(async (txConnection) => {
			await txConnection.query(sql.typeAlias('void')`
				DELETE FROM task_priority WHERE task IN (${sql.join(tasks, sql.fragment`,`)})
			`);
			await txConnection.query(sql.typeAlias('void')`
				INSERT INTO task_priority (priority, task)
				SELECT *
				FROM ${sql.unnest(taskPriorityValues, ['int4', 'uuid'])}
			`);
		});
	};
}

export function setUp(name: string, realm: string) {
	return async (connection: DatabaseConnection) => {
		return await createContainer({
			organization: '00000000-0000-0000-0000-000000000000',
			organizational_unit: null,
			payload: {
				default: true,
				description: '',
				name,
				type: payloadTypes.enum.organization,
				visibility: visibility.enum.public
			},
			realm,
			relation: [],
			user: []
		})(connection);
	};
}
