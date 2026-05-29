import type {CoreNumericMap, EquivalentRecipe} from '@engine/core/equivalentRecipe';
import {
    getFactorioFluidId,
    getFactorioItemId,
    normalizeFactorioFluidResult,
    normalizeFactorioItemResult,
} from './recipeAdapter';
import type {
    FactorioFluidResult,
    FactorioItemResult,
    FactorioPrototypeBase,
    FactorioPrototypeMap,
    FactorioRawDump,
    FactorioRecipeResult,
} from './recipeAdapter';

export interface FactorioEntityPrototype extends FactorioPrototypeBase {
    collision_box?: FactorioBoundingBox;
    minable?: FactorioMiningProperty;
}

export type FactorioBoundingBox = FactorioBoundingBoxPair | FactorioBoundingBoxStruct;
export type FactorioBoundingBoxPair = [FactorioMapPosition, FactorioMapPosition];

export interface FactorioBoundingBoxStruct {
    left_top: FactorioMapPosition;
    right_bottom: FactorioMapPosition;
}

export type FactorioMapPosition = [number, number] | {x: number; y: number};

export interface FactorioResourcePrototype extends FactorioEntityPrototype {
    category?: string;
    infinite?: boolean;
}

export interface FactorioMiningProperty {
    mining_time: number;
    results?: FactorioRecipeResult[];
    result?: string;
    count?: number;
    fluid_amount?: number;
    required_fluid?: string;
}

export interface FactorioMiningDrillPrototype extends FactorioEntityPrototype {
    mining_speed: number;
    resource_categories?: string[];
    resource_drain_rate_percent?: number;
}

export interface FactorioMiningRawDump extends FactorioRawDump {
    resource?: FactorioPrototypeMap<FactorioResourcePrototype>;
    'mining-drill'?: FactorioPrototypeMap<FactorioMiningDrillPrototype>;
}

function addAmount(map: CoreNumericMap, itemId: string, amount: number): void {
    if (!amount) {
        return;
    }
    map[itemId] = (map[itemId] ?? 0) + amount;
}

function getPosition(position: FactorioMapPosition): {x: number; y: number} {
    if (Array.isArray(position)) {
        return {x: position[0], y: position[1]};
    }
    return position;
}

export function getFactorioEntityId(name: string, quality = 0): string {
    return quality > 0 ? `entity:${name}@q${quality}` : `entity:${name}`;
}

export function getFactorioBoundingBoxArea(collisionBox: FactorioBoundingBox | undefined): number {
    if (!collisionBox) {
        return 1;
    }
    const leftTop = getPosition(Array.isArray(collisionBox) ? collisionBox[0] : collisionBox.left_top);
    const rightBottom = getPosition(Array.isArray(collisionBox) ? collisionBox[1] : collisionBox.right_bottom);
    return Math.ceil(rightBottom.x - leftTop.x) * Math.ceil(rightBottom.y - leftTop.y);
}

export function factorioMinerFitsResource(
    miner: FactorioMiningDrillPrototype,
    resource: FactorioResourcePrototype
): boolean {
    const resourceCategory = resource.category ?? 'basic-solid';
    return (miner.resource_categories ?? []).includes(resourceCategory);
}

function addMiningResult(
    outputs: CoreNumericMap,
    result: FactorioRecipeResult,
    speedPerSecond: number
): void {
    if (result.type === 'fluid') {
        const normalized = normalizeFactorioFluidResult(result as FactorioFluidResult);
        addAmount(
            outputs,
            getFactorioFluidId(
                result.name,
                result.temperature ?? result.min_temperature ?? result.max_temperature ?? 15
            ),
            normalized.baseYield * speedPerSecond
        );
        return;
    }

    const normalized = normalizeFactorioItemResult(result as FactorioItemResult);
    addAmount(outputs, getFactorioItemId(result.name), normalized.baseYield * speedPerSecond);
}

export function buildFactorioMiningFlow({
                                            resource,
                                            miner,
                                        }: {
    resource: FactorioResourcePrototype;
    miner: FactorioMiningDrillPrototype;
}): {
    inputs: CoreNumericMap;
    outputs: CoreNumericMap;
    duration: number;
} {
    const miningProperty = resource.minable;
    if (!miningProperty) {
        return {inputs: {}, outputs: {}, duration: 1};
    }

    const duration = miningProperty.mining_time / miner.mining_speed;
    const drainRate = (miner.resource_drain_rate_percent ?? 100) / 100;
    const inputs: CoreNumericMap = {};
    const outputs: CoreNumericMap = {};

    addAmount(inputs, getFactorioEntityId(resource.name), drainRate);

    if (miningProperty.required_fluid && miningProperty.fluid_amount !== undefined) {
        // Factorio 的流体开采消耗在 metatorio 中按每次开采值除以 10 处理。
        addAmount(inputs, getFactorioFluidId(miningProperty.required_fluid), miningProperty.fluid_amount / 10);
    }

    if (miningProperty.result) {
        addAmount(outputs, getFactorioItemId(miningProperty.result), miningProperty.count ?? 1);
    } else {
        for (const result of miningProperty.results ?? []) {
            addMiningResult(outputs, result, 1);
        }
    }

    return {
        inputs,
        outputs,
        duration,
    };
}

export function toFactorioMiningEquivalentRecipe({
                                                     resource,
                                                     miner,
                                                     cost,
                                                 }: {
    resource: FactorioResourcePrototype;
    miner: FactorioMiningDrillPrototype;
    cost?: number;
}): EquivalentRecipe {
    const {inputs, outputs, duration} = buildFactorioMiningFlow({resource, miner});
    return {
        id: `factorio:mining:${resource.name}:${miner.name}`,
        inputs,
        outputs,
        duration,
        cost: cost ?? getFactorioBoundingBoxArea(miner.collision_box),
        sourceRef: {
            gameId: 'factorio',
            rawRecipeId: resource.name,
            prototypeType: 'mining',
            machineId: miner.name,
        },
        display: {
            name: resource.name,
            buildingName: miner.name,
        },
    };
}

export function buildFactorioMiningEquivalentRecipesFromRawDump(rawDump: FactorioMiningRawDump): EquivalentRecipe[] {
    const recipes: EquivalentRecipe[] = [];
    for (const resource of Object.values(rawDump.resource ?? {})) {
        if (!resource.minable) {
            continue;
        }
        for (const miner of Object.values(rawDump['mining-drill'] ?? {})) {
            if (!factorioMinerFitsResource(miner, resource)) {
                continue;
            }
            recipes.push(toFactorioMiningEquivalentRecipe({resource, miner}));
        }
    }
    return recipes;
}
