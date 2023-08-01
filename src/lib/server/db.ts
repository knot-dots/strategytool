import { SchemaValidationError, createPool, createSqlTag } from 'slonik';
import type {
	DatabaseConnection,
	DatabasePool,
	Interceptor,
	QueryResultRow,
	SerializableValue
} from 'slonik';
import { z } from 'zod';
import { container, relation, user } from '$lib/models';
import type {
	Container,
	ModifiedContainer,
	NewContainer,
	PayloadType,
	Relation
} from '$lib/models';

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
			interceptors: [createResultParserInterceptor()]
		});
	}
	return pool;
}

const typeAliases = {
	container: container.omit({ relation: true, user: true }),
	relation,
	relationPath: z.object({}).catchall(z.number().int().positive().nullable()),
	revision: z.object({ revision: z.number().int().positive() }),
	user,
	userWithRevision: user.extend({
		revision: z.number().int().positive()
	}),
	void: z.object({}).strict()
};

const sql = createSqlTag({ typeAliases });

export function createContainer(container: NewContainer) {
	return (connection: DatabaseConnection) => {
		return connection.transaction(async (txConnection) => {
			const containerResult = await txConnection.one(sql.typeAlias('container')`
          INSERT INTO container (payload, realm)
          VALUES (${sql.jsonb(<SerializableValue>container.payload)}, ${container.realm})
          RETURNING *
      `);

			const userValues = container.user.map((u) => [u.issuer, containerResult.revision, u.subject]);
			const userResult = await txConnection.many(sql.typeAlias('user')`
          INSERT INTO container_user (issuer, revision, subject)
          SELECT *
          FROM ${sql.unnest(userValues, ['text', 'int4', 'uuid'])}
          RETURNING issuer, subject
      `);

			const relationValues = container.relation.map((r, position) => [
				r.object ?? containerResult.revision,
				position,
				r.predicate,
				r.subject ?? containerResult.revision
			]);
			await txConnection.query(sql.typeAlias('void')`
				INSERT INTO container_relation (object, position, predicate, subject)
				SELECT *
				FROM ${sql.unnest(relationValues, ['int4', 'int4', 'text', 'int4'])}
      `);

			return { ...containerResult, user: userResult };
		});
	};
}

export function updateContainer(container: ModifiedContainer) {
	return (connection: DatabaseConnection) => {
		return connection.transaction(async (txConnection) => {
			await txConnection.query(sql.typeAlias('void')`
				UPDATE container
				SET valid_currently = false
				WHERE guid = ${container.guid}
			`);

			const containerResult = await txConnection.one(sql.typeAlias('container')`
				INSERT INTO container (payload, realm, guid)
				VALUES (
					${sql.jsonb(<SerializableValue>container.payload)},
					${container.realm},
					${container.guid}
				)
				RETURNING *
      `);

			const userValues = container.user.map((u) => [u.issuer, containerResult.revision, u.subject]);
			const userResult = await txConnection.many(sql.typeAlias('user')`
				INSERT INTO container_user (issuer, revision, subject)
				SELECT *
				FROM ${sql.unnest(userValues, ['text', 'int4', 'uuid'])}
				RETURNING issuer, subject
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
      `);

			// Create new records for relations having this container as object.
			await txConnection.query(sql.typeAlias('void')`
				INSERT INTO container_relation (object, position, predicate, subject)
				SELECT ${containerResult.revision}, cr.position, cr.predicate, cr.subject
				FROM container_relation cr
				JOIN container c ON c.revision = cr.object
				WHERE c.guid = ${container.guid}
				GROUP BY c.guid, cr.predicate, cr.subject, cr.position
      `);

			return { ...containerResult, user: userResult };
		});
	};
}

export function deleteContainer(container: Container) {
	return (connection: DatabaseConnection) => {
		return connection.transaction(async (txConnection) => {
			await txConnection.query(sql.typeAlias('void')`
				UPDATE container
				SET valid_currently = false
				WHERE guid = ${container.guid}
			`);

			const deletedRevision = await txConnection.oneFirst(sql.typeAlias('revision')`
				INSERT INTO container (payload, realm, guid, deleted)
				SELECT payload, realm, guid, true FROM container
				WHERE revision = ${container.revision}
				RETURNING revision
			`);

			const userValues = container.user.map((u) => [u.issuer, deletedRevision, u.subject]);
			await txConnection.query(sql.typeAlias('void')`
				INSERT INTO container_user (issuer, revision, subject)
				SELECT *
				FROM ${sql.unnest(userValues, ['text', 'int4', 'uuid'])}
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
	return async (connection: DatabaseConnection): Promise<Container> => {
		const containerResult = await connection.one(sql.typeAlias('container')`
			SELECT *
			FROM container
			WHERE guid = ${guid}
				AND valid_currently
				AND NOT deleted
		`);
		const userResult = await connection.any(sql.typeAlias('userWithRevision')`
			SELECT *
			FROM container_user
			WHERE revision = ${containerResult.revision}
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
			user: userResult.map(({ issuer, subject }) => ({ issuer, subject }))
		};
	};
}

export function getAllContainerRevisionsByGuid(guid: string) {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
		const containerResult = await connection.many(sql.typeAlias('container')`
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

		const userResult = await connection.any(sql.typeAlias('userWithRevision')`
			SELECT *
			FROM container_user
			WHERE revision IN (${revisions})
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
				.filter((u) => u.revision === c.revision)
				.map(({ issuer, subject }) => ({ issuer, subject }))
		}));
	};
}

function prepareWhereCondition(filters: {
	categories?: string[];
	strategyTypes?: string[];
	terms?: string;
	topics?: string[];
	type?: PayloadType;
}) {
	const conditions = [sql.fragment`valid_currently`, sql.fragment`NOT deleted`];
	if (filters.categories?.length) {
		conditions.push(sql.fragment`payload->'category' ?| ${sql.array(filters.categories, 'text')}`);
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
			sql.fragment`plainto_tsquery('german', ${filters.terms}) @@ jsonb_to_tsvector('german', payload, '["string", "numeric"]')`
		);
	}
	if (filters.topics?.length) {
		conditions.push(sql.fragment`payload->'topic' ?| ${sql.array(filters.topics, 'text')}`);
	}
	if (filters.type) {
		conditions.push(sql.fragment`payload->>'type' = ${filters.type}`);
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
	filters: {
		categories?: string[];
		strategyTypes?: string[];
		terms?: string;
		topics?: string[];
		type?: PayloadType;
	},
	sort: string
) {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
		const containerResult = await connection.any(sql.typeAlias('container')`
			SELECT *
			FROM container
			WHERE ${prepareWhereCondition(filters)}
			ORDER BY ${prepareOrderByExpression(sort)};
    `);

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userWithRevision')`
						SELECT *
						FROM container_user
						WHERE revision IN (${revisions})
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
				.filter((u) => u.revision === c.revision)
				.map(({ issuer, subject }) => ({ issuer, subject }))
		}));
	};
}

export function maybePartOf(containerType: PayloadType) {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
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
		} else if (containerType == 'internal_objective.okr') {
			candidateType = ['internal_objective.strategic_goal'];
		} else if (containerType == 'internal_objective.task') {
			candidateType = ['internal_objective.okr'];
		} else {
			return [];
		}

		const containerResult = await connection.any(sql.typeAlias('container')`
			SELECT *
			FROM container
			WHERE payload->>'type' IN (${sql.join(candidateType, sql.fragment`,`)})
			  AND valid_currently
			  AND NOT deleted
			ORDER BY payload->>'title' DESC
		`);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userWithRevision')`
						SELECT *
						FROM container_user
						WHERE revision IN (${sql.join(
							containerResult.map((c) => c.revision),
							sql.fragment`, `
						)})
					`)
				: [];

		return containerResult.map((c) => ({
			...c,
			relation: [],
			user: userResult
				.filter((u) => u.revision === c.revision)
				.map(({ issuer, subject }) => ({ issuer, subject }))
		}));
	};
}

export function getAllRelatedContainers(
	guid: string,
	filters: {
		categories?: string[];
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

		const relationPathResult = await connection.any(sql.typeAlias('relationPath')`
			SELECT s1.subject AS r1, s1.object AS r2, s2.subject AS r3, s2.object AS r4, s3.subject AS r5, s3.object AS r6, s4.subject AS r7, s4.object AS r8
			FROM
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('measure', 'text')
				WHERE c.valid_currently
			) s1
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('operational_goal', 'text')
				WHERE c.valid_currently
			) s2 ON s1.object = s2.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('strategic_goal', 'text')
				WHERE c.valid_currently
			) s3 ON s2.object = s3.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' IN ('model', 'text')
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
		`);

		const containerResult = await connection.any(sql.typeAlias('container')`
			SELECT *
			FROM container
			WHERE revision IN (${sql.join(
				relationPathResult
					.map((r) => Object.values(r))
					.flat()
					.concat([revision]),
				sql.fragment`, `
			)})
				AND ${prepareWhereCondition(filters)}
			ORDER BY ${prepareOrderByExpression(sort)}
		`);

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userWithRevision')`
						SELECT *
						FROM container_user
						WHERE revision IN (${revisions})
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
				.filter((u) => u.revision === c.revision)
				.map(({ issuer, subject }) => ({ issuer, subject }))
		}));
	};
}

export function getAllRelatedContainersByStrategyType(
	strategyTypes: string[],
	filters: {
		categories?: string[];
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
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' = 'measure'
				WHERE c.valid_currently
			) s1
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' = 'operational_goal'
				WHERE c.valid_currently
			) s2 ON s1.object = s2.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' = 'strategic_goal'
				WHERE c.valid_currently
			) s3 ON s2.object = s3.subject
			FULL JOIN
			(
				SELECT cr.subject, cr.predicate, cr.object
				FROM container c
				JOIN container_relation cr ON c.revision = cr.subject AND c.payload->>'type' = 'model'
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
							AND ${prepareWhereCondition(filters)}
						ORDER BY ${prepareOrderByExpression(sort)}
		`)
				: [];

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userWithRevision')`
						SELECT *
						FROM container_user
						WHERE revision IN (${revisions})
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
				.filter((u) => u.revision === c.revision)
				.map(({ issuer, subject }) => ({ issuer, subject }))
		}));
	};
}

export function getAllContainersWithIndicatorContributions() {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
		const containerResult = await connection.any(sql.typeAlias('container')`
			SELECT *
			FROM container
			WHERE (
					payload->>'indicatorContribution' IS NOT NULL
					OR payload->>'indicatorContribution' != '{}'
				)
				AND valid_currently
				AND NOT deleted
		`);
		return containerResult.map((c) => ({
			...c,
			relation: [],
			user: []
		}));
	};
}

export function getAllContainersRelatedToMeasure(revision: string) {
	return async (connection: DatabaseConnection): Promise<Container[]> => {
		const containerResult = await connection.any(sql.typeAlias('container')`
			SELECT c.*
			FROM container c
			JOIN container_relation cr ON c.revision = cr.subject
				AND cr.predicate = 'is-part-of-measure'
				AND cr.object = ${revision}
			WHERE c.valid_currently AND NOT c.deleted
		`);

		const revisions = sql.join(
			containerResult.map((c) => c.revision),
			sql.fragment`, `
		);

		const userResult =
			containerResult.length > 0
				? await connection.any(sql.typeAlias('userWithRevision')`
						SELECT *
						FROM container_user
						WHERE revision IN (${revisions})
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
				.filter((u) => u.revision === c.revision)
				.map(({ issuer, subject }) => ({ issuer, subject }))
		}));
	};
}
