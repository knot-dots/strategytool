import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import type { MongoAbility } from '@casl/ability';
import { payloadTypes, predicates, visibility } from '$lib/models';
import type { AnyContainer, EmptyContainer, PayloadType } from '$lib/models';
import type { User } from '$lib/stores';

type Actions = 'create' | 'read' | 'update' | 'delete' | 'relate' | 'prioritize';
type Subjects = AnyContainer | EmptyContainer | PayloadType;

const objectiveTypes = [
	payloadTypes.enum.measure,
	payloadTypes.enum.model,
	payloadTypes.enum.operational_goal,
	payloadTypes.enum.simple_measure,
	payloadTypes.enum.strategic_goal,
	payloadTypes.enum.strategy,
	payloadTypes.enum.text
];

const internalObjectiveTypes = [
	payloadTypes.enum['internal_objective.internal_strategy'],
	payloadTypes.enum['internal_objective.milestone'],
	payloadTypes.enum['internal_objective.strategic_goal'],
	payloadTypes.enum['internal_objective.task'],
	payloadTypes.enum['internal_objective.vision']
];

export default function defineAbilityFor(user: User) {
	const { can, build } = new AbilityBuilder<MongoAbility<[Actions, Subjects]>>(createMongoAbility);

	can('read', payloadTypes.options, { 'payload.visibility': visibility.enum.public });

	if (user.isAuthenticated && user.roles.includes('sysadmin')) {
		can(['create', 'update', 'read'], payloadTypes.options);
		can('relate', objectiveTypes);
		can('relate', internalObjectiveTypes);
		can('prioritize', payloadTypes.enum['internal_objective.task']);
		can('read', payloadTypes.enum['internal_objective.task'], ['assignee']);
		can('update', objectiveTypes, ['organization', 'organizational_unit']);
		can('update', internalObjectiveTypes, ['organization', 'organizational_unit']);
		can('update', internalObjectiveTypes, ['organization', 'organizational_unit']);
	} else if (user.isAuthenticated) {
		can('update', payloadTypes.enum.organization, { organization: { $in: user.adminOf } });
		can(['create', 'update'], payloadTypes.enum.organizational_unit, {
			organization: { $in: user.adminOf }
		});
		can(['create', 'update'], objectiveTypes, { organization: { $in: user.adminOf } });
		can(['create', 'update'], internalObjectiveTypes, { organization: { $in: user.adminOf } });
		can(['create', 'update'], internalObjectiveTypes, { organization: { $in: user.memberOf } });
		can(['create', 'update'], payloadTypes.enum.indicator, { organization: { $in: user.adminOf } });
		can(['create', 'update'], objectiveTypes, { organizational_unit: { $in: user.adminOf } });
		can(['create', 'update'], internalObjectiveTypes, {
			organizational_unit: { $in: user.adminOf }
		});
		can(['create', 'update'], internalObjectiveTypes, {
			organizational_unit: { $in: user.memberOf }
		});
		can(['create', 'update'], payloadTypes.enum.indicator, {
			organizational_unit: { $in: user.adminOf }
		});
		can('relate', objectiveTypes, { organization: { $in: user.memberOf } });
		can('relate', internalObjectiveTypes, { organization: { $in: user.memberOf } });
		can('relate', objectiveTypes, { organizational_unit: { $in: user.memberOf } });
		can('relate', internalObjectiveTypes, {
			organizational_unit: { $in: user.memberOf }
		});
		can('prioritize', payloadTypes.enum['internal_objective.task'], {
			organization: { $in: user.memberOf }
		});
		can('prioritize', payloadTypes.enum['internal_objective.task'], {
			organizational_unit: { $in: user.memberOf }
		});
		can('read', payloadTypes.options, {
			'payload.visibility': visibility.enum.creator,
			user: { $elemMatch: { predicate: predicates.enum['is-creator-of'], subject: user.guid } }
		});
		can('read', payloadTypes.options, {
			'payload.visibility': visibility.enum.creator,
			organization: { $in: user.adminOf }
		});
		can('read', payloadTypes.options, {
			'payload.visibility': visibility.enum.creator,
			organizational_unit: { $in: user.adminOf }
		});
		can('read', payloadTypes.options, {
			'payload.visibility': visibility.enum.members,
			organization: { $in: user.memberOf }
		});
		can('read', payloadTypes.options, {
			'payload.visibility': visibility.enum.members,
			organizational_unit: { $in: user.memberOf }
		});
		can('read', payloadTypes.enum.organizational_unit, {
			'payload.visibility': visibility.enum.members,
			guid: { $in: user.memberOf }
		});
		can('read', payloadTypes.enum.organizational_unit, {
			'payload.visibility': visibility.enum.creator,
			guid: { $in: user.adminOf }
		});
		can('read', payloadTypes.enum['internal_objective.task'], ['assignee'], {
			'payload.visibility': visibility.enum.members,
			organization: { $in: user.memberOf }
		});
		can('read', payloadTypes.enum['internal_objective.task'], ['assignee'], {
			'payload.visibility': visibility.enum.members,
			organizational_unit: { $in: user.memberOf }
		});
	}

	return build({
		detectSubjectType: (object) => object.payload.type
	});
}

export function filterVisible<T extends AnyContainer>(containers: Array<T>, user: User): Array<T> {
	const ability = defineAbilityFor(user);
	return containers.filter((c) => ability.can('read', c));
}
