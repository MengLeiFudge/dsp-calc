import type {CoreNumericMap, EquivalentRecipe} from '@engine/core/equivalentRecipe';
import {getFactorioBoundingBoxArea} from './prototype';
import type {FactorioEntityPrototype, FactorioPrototypeBase, FactorioPrototypeMap} from './prototype';

const FACTORIO_CRAFTING_MACHINE_TYPES = ['assembling-machine', 'furnace', 'rocket-silo'] as const;

export interface FactorioRawDump {
    recipe?: FactorioPrototypeMap<FactorioRecipePrototype>;
    'assembling-machine'?: FactorioPrototypeMap<FactorioCraftingMachinePrototype>;
    furnace?: FactorioPrototypeMap<FactorioCraftingMachinePrototype>;
    'rocket-silo'?: FactorioPrototypeMap<FactorioCraftingMachinePrototype>;
}

export interface FactorioRecipePrototype extends FactorioPrototypeBase {
    category?: string;
    additional_categories?: string[];
    ingredients?: FactorioRecipeIngredient[];
    results?: FactorioRecipeResult[];
    main_product?: string;
    energy_required?: number;
    enabled?: boolean;
    hidden?: boolean;
}

export type FactorioRecipeIngredient = FactorioItemIngredient | FactorioFluidIngredient;

export interface FactorioItemIngredient {
    type: 'item';
    name: string;
    amount: number;
}

export interface FactorioFluidIngredient {
    type: 'fluid';
    name: string;
    amount: number;
    temperature?: number;
    minimum_temperature?: number;
    maximum_temperature?: number;
}

export type FactorioRecipeResult = FactorioItemResult | FactorioFluidResult;

export interface FactorioBaseResult {
    name: string;
    amount?: number;
    amount_min?: number;
    amount_max?: number;
    probability?: number;
    ignored_by_stats?: number;
    ignored_by_productivity?: number;
}

export interface FactorioItemResult extends FactorioBaseResult {
    type: 'item';
    extra_count_fraction?: number;
    percent_spoiled?: number;
}

export interface FactorioFluidResult extends FactorioBaseResult {
    type: 'fluid';
    temperature?: number;
    min_temperature?: number;
    max_temperature?: number;
}

export interface FactorioNormalizedOutput {
    baseYield: number;
    productivityYield: number;
}

export interface FactorioCraftingMachinePrototype extends FactorioEntityPrototype {
    crafting_speed?: number;
    crafting_categories?: string[];
    fixed_recipe?: string;
    launch_to_space_platforms?: boolean;
    to_be_inserted_to_rocket_inventory_size?: number;
    rocket_parts_required?: number;
}

function addAmount(map: CoreNumericMap, itemId: string, amount: number): void {
    if (!amount) {
        return;
    }
    map[itemId] = (map[itemId] ?? 0) + amount;
}

export function getFactorioItemId(name: string, quality = 0): string {
    return quality > 0 ? `item:${name}@q${quality}` : `item:${name}`;
}

export function getFactorioFluidId(name: string, temperature?: number | [number, number]): string {
    if (temperature === undefined) {
        return `fluid:${name}`;
    }
    if (Array.isArray(temperature)) {
        return `fluid:${name}@${temperature[0]}..${temperature[1]}`;
    }
    return `fluid:${name}@${temperature}`;
}

export function normalizeFactorioItemResult(result: FactorioItemResult): FactorioNormalizedOutput {
    const extra = result.extra_count_fraction ?? 0;
    const probability = result.probability ?? 1;
    const ignoredByProductivity = Math.floor(result.ignored_by_productivity ?? result.ignored_by_stats ?? 0);

    if (result.amount !== undefined) {
        const base = Math.floor(result.amount);
        const productivityYield = Math.max((base - ignoredByProductivity) * probability * (1 - extra), 0)
            + Math.max((base + 1 - ignoredByProductivity) * probability * extra, 0)
            + Math.max((1 - ignoredByProductivity) * (1 - probability) * extra, 0);
        return {
            baseYield: base * probability + extra,
            productivityYield,
        };
    }

    const min = Math.floor(result.amount_min ?? 0);
    const rawMax = Math.floor(result.amount_max ?? min);
    const max = Math.max(rawMax, min);
    const stateCount = max - min + 1;
    const productivityYield = Math.max(
        (max - ignoredByProductivity + Math.max(min - ignoredByProductivity, 0))
            * (max - Math.max(min - ignoredByProductivity, 0) + 1)
            / stateCount
            / 2
            * probability
            * (1 - extra),
        0
    ) + Math.max(
        (max + 1 - ignoredByProductivity + Math.max(min + 1 - ignoredByProductivity, 0))
            * (max - Math.max(min + 1 - ignoredByProductivity, 0) + 1)
            / stateCount
            / 2
            * probability
            * extra,
        0
    ) + Math.max((extra - ignoredByProductivity) * (1 - probability) * extra, 0);
    return {
        baseYield: ((max + min) / 2) * probability + extra,
        productivityYield,
    };
}

export function normalizeFactorioFluidResult(result: FactorioFluidResult): FactorioNormalizedOutput {
    const probability = result.probability ?? 1;
    const ignoredByProductivity = result.ignored_by_productivity ?? result.ignored_by_stats ?? 0;

    if (result.amount !== undefined) {
        const base = result.amount;
        return {
            baseYield: base * probability,
            productivityYield: Math.max((base - ignoredByProductivity) * probability, 0),
        };
    }

    const min = result.amount_min ?? 0;
    const rawMax = result.amount_max ?? min;
    const max = Math.max(rawMax, min);
    if (max === min) {
        return {
            baseYield: min * probability,
            productivityYield: Math.max((min - ignoredByProductivity) * probability, 0),
        };
    }
    return {
        baseYield: ((max + min) / 2) * probability,
        productivityYield: Math.max(
            (max - ignoredByProductivity + Math.max(min - ignoredByProductivity, 0))
                * (max - Math.max(min - ignoredByProductivity, 0))
                / 2
                / (max - min)
                * probability,
            0
        ),
    };
}

function getIngredientItemId(ingredient: FactorioRecipeIngredient): string {
    if (ingredient.type === 'fluid') {
        const minTemperature = ingredient.temperature ?? ingredient.minimum_temperature;
        const maxTemperature = ingredient.temperature ?? ingredient.maximum_temperature;
        if (minTemperature !== undefined || maxTemperature !== undefined) {
            return getFactorioFluidId(ingredient.name, [
                minTemperature ?? Number.NEGATIVE_INFINITY,
                maxTemperature ?? Number.POSITIVE_INFINITY,
            ]);
        }
        return getFactorioFluidId(ingredient.name);
    }
    return getFactorioItemId(ingredient.name);
}

function getResultItemId(result: FactorioRecipeResult): string {
    if (result.type === 'fluid') {
        return getFactorioFluidId(result.name, result.temperature ?? result.min_temperature ?? result.max_temperature);
    }
    return getFactorioItemId(result.name);
}

export function buildFactorioRecipeFlow(recipe: FactorioRecipePrototype): {
    inputs: CoreNumericMap;
    outputs: CoreNumericMap;
} {
    const inputs: CoreNumericMap = {};
    const outputs: CoreNumericMap = {};

    for (const ingredient of recipe.ingredients ?? []) {
        addAmount(inputs, getIngredientItemId(ingredient), ingredient.amount);
    }
    for (const result of recipe.results ?? []) {
        const normalized = result.type === 'fluid'
            ? normalizeFactorioFluidResult(result)
            : normalizeFactorioItemResult(result);
        addAmount(outputs, getResultItemId(result), normalized.baseYield);
    }

    return {inputs, outputs};
}

export function toFactorioEquivalentRecipe(recipe: FactorioRecipePrototype, cost = 0): EquivalentRecipe {
    const {inputs, outputs} = buildFactorioRecipeFlow(recipe);
    return {
        id: `factorio:recipe:${recipe.name}`,
        inputs,
        outputs,
        duration: recipe.energy_required ?? 0.5,
        cost,
        sourceRef: {
            gameId: 'factorio',
            rawRecipeId: recipe.name,
            prototypeType: 'recipe',
        },
        display: {
            name: recipe.name,
        },
    };
}

export function factorioMachineFitsRecipe(
    machine: FactorioCraftingMachinePrototype,
    recipe: FactorioRecipePrototype
): boolean {
    if (machine.fixed_recipe !== undefined && machine.fixed_recipe !== recipe.name) {
        return false;
    }

    const machineCategories = machine.crafting_categories ?? [];
    const recipeCategory = recipe.category ?? 'crafting';
    if (machineCategories.includes(recipeCategory)) {
        return true;
    }
    return (recipe.additional_categories ?? []).some(category => machineCategories.includes(category));
}

export function toFactorioMachineEquivalentRecipe({
                                                      recipe,
                                                      machine,
                                                      cost,
                                                  }: {
    recipe: FactorioRecipePrototype;
    machine: FactorioCraftingMachinePrototype;
    cost?: number;
}): EquivalentRecipe {
    const {inputs, outputs} = buildFactorioRecipeFlow(recipe);
    const craftingSpeed = machine.crafting_speed ?? 1;
    return {
        id: `factorio:recipe:${recipe.name}:${machine.name}`,
        inputs,
        outputs,
        duration: (recipe.energy_required ?? 0.5) / craftingSpeed,
        cost: cost ?? getFactorioBoundingBoxArea(machine.collision_box),
        sourceRef: {
            gameId: 'factorio',
            rawRecipeId: recipe.name,
            prototypeType: 'recipe',
            machineId: machine.name,
        },
        display: {
            name: recipe.name,
            buildingName: machine.name,
        },
    };
}

export function loadFactorioRecipesFromRawDump(rawDump: FactorioRawDump): FactorioRecipePrototype[] {
    return Object.values(rawDump.recipe ?? {});
}

export function loadFactorioCraftingMachinesFromRawDump(rawDump: FactorioRawDump): FactorioCraftingMachinePrototype[] {
    return FACTORIO_CRAFTING_MACHINE_TYPES.flatMap(prototypeType => Object.values(rawDump[prototypeType] ?? {}));
}

export function buildFactorioEquivalentRecipesFromRawDump(rawDump: FactorioRawDump, cost = 0): EquivalentRecipe[] {
    return loadFactorioRecipesFromRawDump(rawDump).map(recipe => toFactorioEquivalentRecipe(recipe, cost));
}

export function buildFactorioMachineEquivalentRecipesFromRawDump(rawDump: FactorioRawDump): EquivalentRecipe[] {
    const recipes: EquivalentRecipe[] = [];
    for (const recipe of loadFactorioRecipesFromRawDump(rawDump)) {
        for (const machine of loadFactorioCraftingMachinesFromRawDump(rawDump)) {
            if (!factorioMachineFitsRecipe(machine, recipe)) {
                continue;
            }
            recipes.push(toFactorioMachineEquivalentRecipe({recipe, machine}));
        }
    }
    return recipes;
}
