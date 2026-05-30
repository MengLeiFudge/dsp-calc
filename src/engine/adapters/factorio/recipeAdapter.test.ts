import assert from 'node:assert/strict';
import {
    buildFactorioEquivalentRecipesFromRawDump,
    buildFactorioMachineEquivalentRecipesFromRawDump,
    factorioMachineFitsRecipe,
    getFactorioFluidId,
    getFactorioItemId,
    normalizeFactorioFluidResult,
    normalizeFactorioItemResult,
    toFactorioEquivalentRecipe,
    toFactorioMachineEquivalentRecipe,
} from './recipeAdapter';
import type {FactorioCraftingMachinePrototype, FactorioRecipePrototype} from './recipeAdapter';

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

test('Factorio recipe prototype converts item and fluid flow to core equivalent recipe', () => {
    const recipe: FactorioRecipePrototype = {
        name: 'iron-gear-wheel',
        ingredients: [
            {type: 'item', name: 'iron-plate', amount: 2},
            {type: 'fluid', name: 'water', amount: 10, temperature: 25},
        ],
        results: [
            {type: 'item', name: 'iron-gear-wheel', amount: 1, probability: 0.5},
            {type: 'fluid', name: 'steam', amount: 5, temperature: 165},
        ],
        energy_required: 0.5,
    };

    const equivalentRecipe = toFactorioEquivalentRecipe(recipe, 4);

    assert.equal(equivalentRecipe.id, 'factorio:recipe:iron-gear-wheel');
    assert.equal(equivalentRecipe.duration, 0.5);
    assert.equal(equivalentRecipe.cost, 4);
    assert.deepEqual(equivalentRecipe.inputs, {
        [getFactorioItemId('iron-plate')]: 2,
        [getFactorioFluidId('water', [25, 25])]: 10,
    });
    assert.deepEqual(equivalentRecipe.outputs, {
        [getFactorioItemId('iron-gear-wheel')]: 0.5,
        [getFactorioFluidId('steam', 165)]: 5,
    });
    assert.deepEqual(equivalentRecipe.sourceRef, {
        gameId: 'factorio',
        rawRecipeId: 'iron-gear-wheel',
        prototypeType: 'recipe',
    });
});

test('Factorio item result normalization follows metatorio expected yield rules', () => {
    assert.deepEqual(
        normalizeFactorioItemResult({
            type: 'item',
            name: 'scrap',
            amount_min: 1,
            amount_max: 3,
            probability: 0.5,
        }),
        {baseYield: 1, productivityYield: 1}
    );

    assert.deepEqual(
        normalizeFactorioItemResult({
            type: 'item',
            name: 'plate',
            amount: 2,
            probability: 0.8,
            extra_count_fraction: 0.25,
            ignored_by_stats: 1,
        }),
        {baseYield: 1.85, productivityYield: 1}
    );
});

test('Factorio fluid result normalization handles fixed and ranged amounts', () => {
    assert.deepEqual(
        normalizeFactorioFluidResult({
            type: 'fluid',
            name: 'heavy-oil',
            amount: 10,
            probability: 0.25,
            ignored_by_productivity: 2,
        }),
        {baseYield: 2.5, productivityYield: 2}
    );

    assert.deepEqual(
        normalizeFactorioFluidResult({
            type: 'fluid',
            name: 'steam',
            amount_min: 10,
            amount_max: 20,
            probability: 0.5,
        }),
        {baseYield: 7.5, productivityYield: 7.5}
    );
});

test('Factorio raw dump recipe map builds equivalent recipe list', () => {
    const recipes = buildFactorioEquivalentRecipesFromRawDump({
        recipe: {
            copper_cable: {
                name: 'copper-cable',
                ingredients: [{type: 'item', name: 'copper-plate', amount: 1}],
                results: [{type: 'item', name: 'copper-cable', amount: 2}],
                energy_required: 0.5,
            },
        },
    });

    assert.equal(recipes.length, 1);
    assert.equal(recipes[0].id, 'factorio:recipe:copper-cable');
    assert.deepEqual(recipes[0].inputs, {[getFactorioItemId('copper-plate')]: 1});
    assert.deepEqual(recipes[0].outputs, {[getFactorioItemId('copper-cable')]: 2});
});

test('Factorio recipe with crafting machine converts speed, cost and source reference', () => {
    const recipe: FactorioRecipePrototype = {
        name: 'iron-gear-wheel',
        category: 'crafting',
        ingredients: [{type: 'item', name: 'iron-plate', amount: 2}],
        results: [{type: 'item', name: 'iron-gear-wheel', amount: 1}],
        energy_required: 0.5,
    };
    const machine: FactorioCraftingMachinePrototype = {
        name: 'assembling-machine-2',
        crafting_speed: 0.75,
        crafting_categories: ['crafting'],
        collision_box: [[-1.4, -1.4], [1.4, 1.4]],
    };

    const equivalentRecipe = toFactorioMachineEquivalentRecipe({recipe, machine});

    assert.equal(equivalentRecipe.id, 'factorio:recipe:iron-gear-wheel:assembling-machine-2');
    assert.equal(equivalentRecipe.duration, 0.5 / 0.75);
    assert.equal(equivalentRecipe.cost, 9);
    assert.deepEqual(equivalentRecipe.inputs, {[getFactorioItemId('iron-plate')]: 2});
    assert.deepEqual(equivalentRecipe.outputs, {[getFactorioItemId('iron-gear-wheel')]: 1});
    assert.deepEqual(equivalentRecipe.sourceRef, {
        gameId: 'factorio',
        rawRecipeId: 'iron-gear-wheel',
        prototypeType: 'recipe',
        machineId: 'assembling-machine-2',
    });
    assert.deepEqual(equivalentRecipe.display, {
        name: 'iron-gear-wheel',
        buildingName: 'assembling-machine-2',
    });
});

test('Factorio machine fit follows default category, additional categories and fixed recipe', () => {
    const machine: FactorioCraftingMachinePrototype = {
        name: 'chemical-plant',
        crafting_speed: 1,
        crafting_categories: ['crafting-with-fluid', 'chemistry'],
    };

    assert.equal(
        factorioMachineFitsRecipe(machine, {
            name: 'recipe-with-additional-category',
            additional_categories: ['crafting-with-fluid'],
        }),
        true
    );
    assert.equal(
        factorioMachineFitsRecipe({name: 'assembler', crafting_categories: ['crafting']}, {name: 'default-recipe'}),
        true
    );
    assert.equal(
        factorioMachineFitsRecipe(
            {name: 'rocket-silo', crafting_categories: ['rocket-building'], fixed_recipe: 'rocket-part'},
            {name: 'satellite', category: 'rocket-building'}
        ),
        false
    );
});

test('Factorio raw dump expands matching recipe and crafting machine pairs only', () => {
    const recipes = buildFactorioMachineEquivalentRecipesFromRawDump({
        recipe: {
            gear: {
                name: 'iron-gear-wheel',
                ingredients: [{type: 'item', name: 'iron-plate', amount: 2}],
                results: [{type: 'item', name: 'iron-gear-wheel', amount: 1}],
                energy_required: 0.5,
            },
            steel: {
                name: 'steel-plate',
                category: 'smelting',
                ingredients: [{type: 'item', name: 'iron-plate', amount: 5}],
                results: [{type: 'item', name: 'steel-plate', amount: 1}],
                energy_required: 16,
            },
        },
        'assembling-machine': {
            assembler: {
                name: 'assembling-machine-1',
                crafting_speed: 0.5,
                crafting_categories: ['crafting'],
            },
        },
        furnace: {
            stone: {
                name: 'stone-furnace',
                crafting_speed: 1,
                crafting_categories: ['smelting'],
            },
        },
    });

    assert.equal(recipes.length, 2);
    assert.deepEqual(
        recipes.map(recipe => recipe.id).sort(),
        [
            'factorio:recipe:iron-gear-wheel:assembling-machine-1',
            'factorio:recipe:steel-plate:stone-furnace',
        ]
    );
});
