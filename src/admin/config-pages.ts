// ---------------------------------------------------------------------------
// Goals / Funnels admin pages
// ---------------------------------------------------------------------------

import type { DetectionCatalog, FunnelDefinition, GoalDefinition, GoalType } from "../types.js";
import { banner, context, divider, header, tableBlock } from "./components.js";

function optionize(items: string[]): Array<{ label: string; value: string }> {
	return items.map((item) => ({ label: item, value: item }));
}

function targetField(prefix: string, label: string, type: GoalType, options: string[]): Record<string, unknown> {
	return {
		type: "combobox",
		action_id: `${prefix}_${type}_target`,
		label,
		options: optionize(options),
		placeholder: type === "page" ? "/pricing" : type === "form" ? "newsletter" : "cta_click",
		condition: { field: `${prefix}_type`, eq: type },
	};
}

export function buildGoalsPage(input: {
	goals: GoalDefinition[];
	catalog: DetectionCatalog;
}): Record<string, unknown> {
	const { goals, catalog } = input;
	const blocks: Record<string, unknown>[] = [
		header("Goals"),
		banner("Configure conversions", "Create page, form, or event goals without touching code. Developers can still send custom events and make them selectable here."),
	];

	blocks.push({
		type: "form",
		block_id: "goal-preset-form",
		fields: [
			{
				type: "select",
				action_id: "goal_preset",
				label: "Quick presets",
				options: [
					{ label: "Newsletter signup", value: "newsletter_signup" },
					{ label: "Contact form", value: "contact_form" },
					{ label: "Pricing CTA click", value: "pricing_cta" },
					{ label: "Thank you page", value: "thank_you_page" },
				],
			},
		],
		submit: { label: "Add Preset", action_id: "add_goal_preset" },
	});

	blocks.push(
		header("Add Goal"),
		{
			type: "form",
			block_id: "goal-create-form",
			fields: [
				{ type: "text_input", action_id: "goal_name", label: "Goal name", placeholder: "Newsletter Signup" },
				{
					type: "radio",
					action_id: "goal_type",
					label: "Goal type",
					initial_value: "page",
					options: [
						{ label: "Page", value: "page" },
						{ label: "Form", value: "form" },
						{ label: "Event", value: "event" },
					],
				},
				targetField("goal", "Page target", "page", catalog.pages),
				targetField("goal", "Form target", "form", catalog.forms),
				targetField("goal", "Event target", "event", catalog.events),
				{
					type: "toggle",
					action_id: "goal_active",
					label: "Active",
					description: "Include this goal in conversion reporting.",
					initial_value: true,
				},
			],
			submit: { label: "Save Goal", action_id: "save_goal" },
		},
	);

	if (goals.length > 0) {
		blocks.push(
			divider(),
			header("Configured Goals"),
			tableBlock(
				[
					{ key: "name", label: "Goal" },
					{ key: "type", label: "Type" },
					{ key: "target", label: "Target" },
					{ key: "status", label: "Status" },
				],
				goals.map((goal) => ({
					name: goal.name,
					type: goal.type,
					target: goal.target,
					status: goal.active ? "Active" : "Paused",
				})),
			),
			{
				type: "form",
				block_id: "goal-remove-form",
				fields: [
					{
						type: "select",
						action_id: "goal_id",
						label: "Remove goal",
						options: goals.map((goal) => ({ label: goal.name, value: goal.id })),
					},
				],
				submit: { label: "Delete Goal", action_id: "delete_goal" },
			},
		);
	} else {
		blocks.push(context("No goals configured yet. Start with a preset or add one manually."));
	}

	return { blocks };
}

function stepFields(prefix: string, index: number, catalog: DetectionCatalog): Record<string, unknown>[] {
	const base = `${prefix}_step_${index}`;
	return [
		{
			type: "text_input",
			action_id: `${base}_label`,
			label: `Step ${index} label`,
			placeholder: index === 1 ? "Pricing Page" : index === 2 ? "CTA Click" : "Signup Submit",
		},
		{
			type: "radio",
			action_id: `${base}_type`,
			label: `Step ${index} type`,
			initial_value: index === 1 ? "page" : "event",
			options: [
				{ label: "Page", value: "page" },
				{ label: "Form", value: "form" },
				{ label: "Event", value: "event" },
			],
		},
		targetField(base, `Step ${index} page target`, "page", catalog.pages),
		targetField(base, `Step ${index} form target`, "form", catalog.forms),
		targetField(base, `Step ${index} event target`, "event", catalog.events),
	];
}

export function buildFunnelsPage(input: {
	funnels: FunnelDefinition[];
	catalog: DetectionCatalog;
	stepCount: number;
}): Record<string, unknown> {
	const { funnels, catalog, stepCount } = input;
	const blocks: Record<string, unknown>[] = [
		header("Funnels"),
		banner("Guide users through a path", "Use presets for common conversion flows or define your own funnel using detected pages, forms, and events."),
	];

	blocks.push({
		type: "form",
		block_id: "funnel-preset-form",
		fields: [
			{
				type: "select",
				action_id: "funnel_preset",
				label: "Quick presets",
				options: [
					{ label: "Lead generation", value: "lead_generation" },
					{ label: "Newsletter", value: "newsletter" },
					{ label: "Contact", value: "contact" },
				],
			},
		],
		submit: { label: "Add Preset", action_id: "add_funnel_preset" },
	});

	blocks.push(
		header("Add Funnel"),
		{
			type: "actions",
			elements: [
				{
					type: "button",
					action_id: "add_funnel_step",
					label: "Add step",
					style: "secondary",
				},
				{
					type: "button",
					action_id: "remove_funnel_step",
					label: "Remove step",
					style: "secondary",
				},
			],
		},
		context(`Builder steps: ${stepCount}`),
		{
			type: "form",
			block_id: "funnel-create-form",
			fields: [
				{ type: "text_input", action_id: "funnel_name", label: "Funnel name", placeholder: "Pricing Funnel" },
				...Array.from({ length: stepCount }, (_, index) => stepFields("funnel", index + 1, catalog)).flat(),
				{
					type: "toggle",
					action_id: "funnel_active",
					label: "Active",
					description: "Show this funnel in the conversion dashboard.",
					initial_value: true,
				},
			],
			submit: { label: "Save Funnel", action_id: "save_funnel" },
		},
	);

	if (funnels.length > 0) {
		const rows = funnels.map((funnel) => ({
			name: funnel.name,
			steps: funnel.steps.map((step) => step.label).join(" -> "),
			status: funnel.active ? "Active" : "Paused",
		}));
		blocks.push(
			divider(),
			header("Configured Funnels"),
			tableBlock(
				[
					{ key: "name", label: "Funnel" },
					{ key: "steps", label: "Steps" },
					{ key: "status", label: "Status" },
				],
				rows,
			),
			{
				type: "form",
				block_id: "funnel-remove-form",
				fields: [
					{
						type: "select",
						action_id: "funnel_id",
						label: "Remove funnel",
						options: funnels.map((funnel) => ({ label: funnel.name, value: funnel.id })),
					},
				],
				submit: { label: "Delete Funnel", action_id: "delete_funnel" },
			},
		);
	} else {
		blocks.push(context("No funnels configured yet. Start with a preset and adjust it over time."));
	}

	return { blocks };
}
