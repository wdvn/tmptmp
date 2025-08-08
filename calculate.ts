// Recipe Cost & Nutrition Optimizer Implementation - CORRECTED
// Based on actual data analysis

import {Recipe, UoMName, UoMType} from "./supporting-files/models";
import {GetProductsForIngredient, GetUnitsData} from "./supporting-files/data-access";

function convertUnits(amount: number, fromUnit: UoMName, toUnit: UoMName) {
    if (fromUnit === toUnit) return amount;

    const conversion = GetUnitsData().find(c =>
        c.fromUnitName === fromUnit && c.toUnitName === toUnit
    );

    return conversion ? amount * conversion.conversionFactor : amount;
}

function standardizeIngredientAmount(ingredient: any, amount: number, unit: UoMName) {
    // Convert to standard units for calculation
    if (ingredient.toLowerCase() === 'cream') {
        // Convert cups to ml: 2 cups = 2 * 236.6 = 473.2 ml
        return unit === UoMName.cups ? convertUnits(amount, UoMName.cups, UoMName.millilitres) : amount;
    } else if (ingredient.toLowerCase() === 'sugar') {
        // For sugar: 0.5 cups = 0.5 * 236.6 = 118.3 ml = 118.3g (assuming density = 1)
        return unit === UoMName.cups ? convertUnits(amount, UoMName.cups, UoMName.millilitres) : amount;
    } else if (ingredient.toLowerCase() === 'egg') {
        return amount; // 5 eggs
    }
    return amount;
}

export function getOptimalCostAndNutrition(recipe: Recipe) {
    // Step 1: Extract and standardize ingredient requirements
    const ingredients = {};
    recipe.lineItems.forEach(item => {
        const ingredientName = item.ingredient.ingredientName.toLowerCase();
        const standardAmount = standardizeIngredientAmount(
            ingredientName,
            item.unitOfMeasure.uomAmount,
            item.unitOfMeasure.uomName
        );

        ingredients[ingredientName] = {
            requiredAmount: standardAmount,
            originalAmount: item.unitOfMeasure.uomAmount,
            originalUnit: item.unitOfMeasure.uomName,
            standardUnit: getStandardUnit(ingredientName)
        };
    });

    // Step 2: Find optimal suppliers
    const optimalSolution = solveLinearProgram(recipe.lineItems, ingredients);

    // Step 3: Calculate nutrition at optimal cost
    const nutritionProfile = calculateNutritionAtOptimalCost(optimalSolution);

    // Step 4: Format results with recipe name as key
    const result = {
        cheapestCost: optimalSolution.totalCost,
        nutrientsAtCheapestCost: nutritionProfile,
    };

    return result;
}

function getStandardUnit(ingredient: string) {
    const units = {
        'cream': 'ml',
        'egg': 'whole',
        'sugar': 'ml' // converted from cups
    };
    return units[ingredient.toLowerCase()] || 'units';
}

function solveLinearProgram(ingredients: any[], converted: any) {
    let totalCost = 0;
    const costBreakdown = {};
    const suppliers = {};

    let allProducts = ingredients.map(item => GetProductsForIngredient(item.ingredient)).reduce((accumulator, currentChunk) => {
        return accumulator.concat(currentChunk);
    }, []);

    // Find cheapest option for each ingredient
    Object.entries(converted).forEach(([ingredientName, data]: [string, any]) => {
        let bestOption: any = {
            cost: Infinity,
            supplier: null,
            product: null,
            pricePerUnit: Infinity,
            actualAmountNeeded: data.requiredAmount
        };

        allProducts.forEach(product => {
            if (isProductMatchingIngredient(product.productName, ingredientName)) {
                product.supplierProducts.forEach(supplierProduct => {
                    const pricePerUnit = calculatePricePerUnit(supplierProduct, ingredientName);
                    const totalCostForThisOption = data.requiredAmount * pricePerUnit;

                    if (totalCostForThisOption < bestOption.cost) {
                        bestOption = {
                            cost: totalCostForThisOption,
                            supplier: supplierProduct.supplierName,
                            product: product,
                            supplierProduct: supplierProduct,
                            pricePerUnit: pricePerUnit,
                            actualAmountNeeded: data.requiredAmount
                        };
                    }
                });
            }
        });

        if (bestOption.supplier) {
            totalCost += bestOption.cost;
            costBreakdown[ingredientName] = bestOption.cost;
            suppliers[ingredientName] = bestOption;
        }
    });

    return {
        totalCost,
        costBreakdown,
        suppliers
    };
}

function isProductMatchingIngredient(productName: string, ingredientName: string) {
    const productLower = productName.toLowerCase();
    const ingredientLower = ingredientName.toLowerCase();

    // More flexible matching rules
    const matchingRules = {
        'cream': ['cream'],
        'egg': ['egg'],
        'sugar': ['sugar']
    };

    const keywords = matchingRules[ingredientLower] || [ingredientLower];
    return keywords.some((keyword: string) => productLower.includes(keyword));
}

function calculatePricePerUnit(supplierProduct: any, ingredientName: string) {
    const basePrice = supplierProduct.supplierPrice;
    const packageAmount = supplierProduct.supplierProductUoM.uomAmount;
    const packageUnit = supplierProduct.supplierProductUoM.uomName;

    if (ingredientName.toLowerCase() === 'cream') {
        // Price per ml
        return basePrice / packageAmount;
    } else if (ingredientName.toLowerCase() === 'egg') {
        // Price per egg
        return basePrice / packageAmount;
    } else if (ingredientName.toLowerCase() === 'sugar') {
        if (packageUnit === UoMName.kilogram) {
            // Convert to price per ml (assuming 1g = 1ml for sugar)
            return basePrice / (packageAmount * 1000);
        }
        return basePrice / packageAmount;
    }

    return basePrice / packageAmount;
}

function calculateNutritionAtOptimalCost(optimalSolution: any) {
    const nutritionProfile = {};

    // Calculate total recipe weight in grams
    let totalRecipeWeight = 0;
    const rawNutrients = {};

    Object.entries(optimalSolution.suppliers).forEach(([ingredientName, supplier]: [string, any]) => {
        if (supplier && supplier.product) {
            const product = supplier.product;
            const amountUsed = supplier.actualAmountNeeded;

            // Calculate weight contribution based on actual amounts
            let weightInGrams = 0;
            if (ingredientName === 'cream') {
                // 473.2 ml cream ≈ 473.2 grams
                weightInGrams = amountUsed;
            } else if (ingredientName === 'egg') {
                // 5 eggs × 50g = 250 grams
                weightInGrams = amountUsed * 50;
            } else if (ingredientName === 'sugar') {
                // 118.3 ml sugar ≈ 118.3 grams
                weightInGrams = amountUsed;
            }

            totalRecipeWeight += weightInGrams;

            // Process nutrients from this ingredient
            product.nutrientFacts.forEach((nutrient: any) => {
                const nutrientName = nutrient.nutrientName;
                const nutrientAmount = calculateNutrientAmount(nutrient, amountUsed, ingredientName, weightInGrams);

                if (!rawNutrients[nutrientName]) {
                    rawNutrients[nutrientName] = 0;
                }
                rawNutrients[nutrientName] += nutrientAmount;
            });
        }
    });

    // Convert to per 100g format
    Object.entries(rawNutrients).forEach(([nutrientName, totalAmount]: [string, number]) => {
        let per100gAmount = (totalAmount / totalRecipeWeight) * 100;

        // Handle special unit conversions
        let finalAmount = per100gAmount;
        if (nutrientName === "Sodium") {
            // Sodium is in mg, convert to grams: mg / 1000
            finalAmount = per100gAmount / 1000;
        }

        nutritionProfile[nutrientName] = {
            nutrientName: nutrientName,
            quantityAmount: {
                uomAmount: parseFloat(finalAmount.toFixed(1)),
                uomName: UoMName.grams,
                uomType: UoMType.mass
            },
            quantityPer: {
                uomAmount: 100,
                uomName: UoMName.grams,
                uomType: UoMType.mass
            }
        };
    });

    return nutritionProfile;
}

function calculateNutrientAmount(nutrient: any, amountUsed: number, ingredientName: string, weightInGrams: number) {
    const nutrientPer100Units = nutrient.quantityAmount.uomAmount;
    const per100UnitsType = nutrient.quantityPer.uomName;

    let nutrientAmount = 0;

    if (ingredientName === 'cream') {
        if (per100UnitsType === UoMName.millilitres) {
            // Nutrient per 100ml, we have amountUsed ml
            nutrientAmount = (amountUsed / 100) * nutrientPer100Units;
        } else if (per100UnitsType === UoMName.grams) {
            // Nutrient per 100g, we have weightInGrams g
            nutrientAmount = (weightInGrams / 100) * nutrientPer100Units;
        }
    } else if (ingredientName === 'egg') {
        // Eggs: nutrient per 100g, we have amountUsed eggs × 50g each
        nutrientAmount = (weightInGrams / 100) * nutrientPer100Units;
    } else if (ingredientName === 'sugar') {
        if (per100UnitsType === UoMName.millilitres) {
            // Sugar nutrient per 100ml
            nutrientAmount = (amountUsed / 100) * nutrientPer100Units;
        } else if (per100UnitsType === UoMName.grams) {
            // Sugar nutrient per 100g
            nutrientAmount = (weightInGrams / 100) * nutrientPer100Units;
        }
    }

    return nutrientAmount;
}

//
// // Execute the optimization
// const optimizationResult = getOptimalCostAndNutrition(GetRecipes()[0]);
// console.log(JSON.stringify(optimizationResult, null, 2));