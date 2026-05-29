import assert from 'node:assert/strict';
import {
    buildFactorioMiningEquivalentRecipesFromRawDump,
    getFactorioBoundingBoxArea,
    getFactorioEntityId,
    factorioMinerFitsResource,
    toFactorioMiningEquivalentRecipe,
} from './miningAdapter';
import {getFactorioFluidId, getFactorioItemId} from './recipeAdapter';
import type {FactorioMiningDrillPrototype, FactorioResourcePrototype} from './miningAdapter';

function test(name: string, fn: () => void): void {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
}

test('Factorio mining converts resource and miner prototype to equivalent recipe', () => {
    const resource: FactorioResourcePrototype = {
        name: 'iron-ore',
        category: 'basic-solid',
        minable: {
            mining_time: 2,
            result: 'iron-ore',
            count: 1,
        },
    };
    const miner: FactorioMiningDrillPrototype = {
        name: 'electric-mining-drill',
        mining_speed: 0.5,
        resource_categories: ['basic-solid'],
        collision_box: [{x: -1.4, y: -1.4}, {x: 1.4, y: 1.4}],
    };

    const equivalentRecipe = toFactorioMiningEquivalentRecipe({resource, miner});

    assert.equal(equivalentRecipe.id, 'factorio:mining:iron-ore:electric-mining-drill');
    assert.equal(equivalentRecipe.duration, 4);
    assert.deepEqual(equivalentRecipe.inputs, {[getFactorioEntityId('iron-ore')]: 1});
    assert.deepEqual(equivalentRecipe.outputs, {[getFactorioItemId('iron-ore')]: 1});
    assert.equal(equivalentRecipe.cost, 9);
    assert.deepEqual(equivalentRecipe.sourceRef, {
        gameId: 'factorio',
        rawRecipeId: 'iron-ore',
        prototypeType: 'mining',
        machineId: 'electric-mining-drill',
    });
});

test('Factorio mining handles required fluid and multiple mining results', () => {
    const resource: FactorioResourcePrototype = {
        name: 'uranium-ore',
        category: 'basic-solid',
        minable: {
            mining_time: 4,
            required_fluid: 'sulfuric-acid',
            fluid_amount: 10,
            results: [
                {type: 'item', name: 'uranium-ore', amount: 1, probability: 0.5},
                {type: 'fluid', name: 'steam', amount: 5, temperature: 165},
            ],
        },
    };
    const miner: FactorioMiningDrillPrototype = {
        name: 'big-mining-drill',
        mining_speed: 2,
        resource_categories: ['basic-solid'],
        resource_drain_rate_percent: 50,
    };

    const equivalentRecipe = toFactorioMiningEquivalentRecipe({resource, miner, cost: 3});

    assert.equal(equivalentRecipe.duration, 2);
    assert.deepEqual(equivalentRecipe.inputs, {
        [getFactorioEntityId('uranium-ore')]: 0.5,
        [getFactorioFluidId('sulfuric-acid')]: 1,
    });
    assert.deepEqual(equivalentRecipe.outputs, {
        [getFactorioItemId('uranium-ore')]: 0.5,
        [getFactorioFluidId('steam', 165)]: 5,
    });
    assert.equal(equivalentRecipe.cost, 3);
});

test('Factorio mining raw dump expands matching resource and miner pairs only', () => {
    const recipes = buildFactorioMiningEquivalentRecipesFromRawDump({
        resource: {
            iron: {
                name: 'iron-ore',
                category: 'basic-solid',
                minable: {mining_time: 1, result: 'iron-ore'},
            },
            crude: {
                name: 'crude-oil',
                category: 'basic-fluid',
                minable: {mining_time: 1, result: 'crude-oil'},
            },
        },
        'mining-drill': {
            electric: {
                name: 'electric-mining-drill',
                mining_speed: 0.5,
                resource_categories: ['basic-solid'],
            },
        },
    });

    assert.equal(recipes.length, 1);
    assert.equal(recipes[0].id, 'factorio:mining:iron-ore:electric-mining-drill');
});

test('Factorio miner fit and collision area follow metatorio defaults', () => {
    assert.equal(
        factorioMinerFitsResource(
            {name: 'miner', mining_speed: 1, resource_categories: ['basic-solid']},
            {name: 'resource'}
        ),
        true
    );
    assert.equal(getFactorioBoundingBoxArea([[-1.2, -0.9], [1.2, 0.9]]), 6);
});
