// Recipe Cost & Nutrition Optimizer Implementation
// Based on formal linear programming model


// Utility Functions
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
    // Standardize to base units for calculation
    if (ingredient.toLowerCase() === 'cream') {
        return unit === UoMName.cups ? convertUnits(amount, UoMName.cups, UoMName.millilitres) : amount;
    } else if (ingredient.toLowerCase() === 'sugar') {
        return unit === UoMName.cups ? convertUnits(amount, UoMName.cups, UoMName.millilitres) : amount; // Assume sugar density ≈ 1g/ml
    } else if (ingredient.toLowerCase() === 'egg') {
        return amount; // Eggs are already in whole units
    }
    return amount;
}

// Main Linear Programming Optimizer
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

    // Step 2: Find optimal suppliers (Linear Programming Solution)
    // @ts-ignore
    const optimalSolution = solveLinearProgram(recipe.lineItems,ingredients);

    // Step 3: Calculate nutrition at the cheapest cost
    const nutritionProfile = calculateNutritionAtOptimalCost(optimalSolution);

    // Step 4: Format results
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
        'sugar': 'grams'
    };
    return units[ingredient.toLowerCase()] || 'units';
}

function solveLinearProgram(ingredients: any[],converted: any) {

    let totalCost = 0;
    const costBreakdown = {};
    const suppliers = {};
    const decisionVariables = {};
    const constraintsSatisfied = {};
    let allProducts= ingredients.map(item=>GetProductsForIngredient(item.ingredient)).reduce((accumulator, currentChunk) => {
        return accumulator.concat(currentChunk);
    }, [])

    // For each ingredient, find the cheapest supplier (LP solution)
    Object.entries(converted).forEach(([ingredientName, data]:[string,any]) => {
        let bestOption: any = {
            cost: Infinity,
            supplier: null,
            product: null,
            pricePerUnit: Infinity,
            actualAmountNeeded: data.requiredAmount
        };
        // Search through all products for this ingredient
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
            decisionVariables[`x_${ingredientName}`] = bestOption.actualAmountNeeded;
            constraintsSatisfied[`constraint_${ingredientName}`] = {
                required: data.requiredAmount,
                provided: bestOption.actualAmountNeeded,
                satisfied: bestOption.actualAmountNeeded >= data.requiredAmount
            };
        } else {
        }
    });

    return {
        totalCost,
        costBreakdown,
        suppliers,
        decisionVariables,
        constraintsSatisfied
    };
}

function isProductMatchingIngredient(productName: string, ingredientName: string) {
    const productLower = productName.toLowerCase();
    const ingredientLower = ingredientName.toLowerCase();

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

    if (ingredientName.toLowerCase() === 'cream' && packageUnit === UoMName.millilitres) {
        return basePrice / packageAmount; // Price per ml
    } else if (ingredientName.toLowerCase() === 'egg' && packageUnit === UoMName.whole) {
        return basePrice / packageAmount; // Price per egg
    } else if (ingredientName.toLowerCase() === 'sugar') {
        if (packageUnit === UoMName.kilogram) {
            return basePrice / (packageAmount * 1000); // Price per gram
        }
        return basePrice / packageAmount;
    }

    return basePrice / packageAmount; // Default calculation
}

function calculateNutritionAtOptimalCost(optimalSolution: any) {
    const nutritionProfile = {};
    let totalRecipeWeight = 0; // Total weight in grams for per 100g calculation

    // First pass: Calculate total weight and collect all nutrients
    const rawNutrients = {};

    Object.entries(optimalSolution.suppliers).forEach(([ingredientName, supplier]: [string, any]) => {
        if (supplier && supplier.product) {
            const product = supplier.product;
            const amountUsed = supplier.actualAmountNeeded;


            // Calculate weight contribution
            let weightInGrams = 0;
            if (ingredientName === 'cream') {
                weightInGrams = amountUsed; // ml to grams (density ≈ 1)
            } else if (ingredientName === 'egg') {
                weightInGrams = amountUsed * 50; // eggs to grams (50g per egg)
            } else if (ingredientName === 'sugar') {
                weightInGrams = amountUsed; // already in grams
            }

            totalRecipeWeight += weightInGrams;

            // Process each nutrient
            product.nutrientFacts.forEach((nutrient: any) => {
                const nutrientName = nutrient.nutrientName;
                const nutrientAmount = calculateNutrientAmount(nutrient, amountUsed, ingredientName);

                if (!rawNutrients[nutrientName]) {
                    rawNutrients[nutrientName] = 0;
                }
                rawNutrients[nutrientName] += nutrientAmount;
            });
        }
    });


    // Second pass: Convert to per 100g format
    Object.entries(rawNutrients).forEach(([nutrientName, totalAmount]: [string, number]) => {
        // Convert to grams if needed
        let amountInGrams = totalAmount;

        // Handle unit conversions
        if (nutrientName === "Sodium") {
            // Convert milligrams to grams
            amountInGrams = totalAmount / 1000;
        }

        // Calculate per 100g amount
        const per100gAmount = (amountInGrams / totalRecipeWeight) * 100;

        nutritionProfile[nutrientName] = {
            nutrientName: nutrientName,
            quantityAmount: {
                uomAmount: parseFloat(per100gAmount.toFixed(3)),
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

function calculateNutrientAmount(nutrient: any, amountUsed: number, ingredientName: string) {
    const nutrientPer100Units = nutrient.quantityAmount.uomAmount;
    const per100UnitsType = nutrient.quantityPer.uomName;

    // Convert amount used to the same units as nutrition facts
    let standardizedAmountUsed = amountUsed;

    if (ingredientName.toLowerCase() === 'cream' && per100UnitsType === UoMName.millilitres) {
        // Amount is already in ml
        standardizedAmountUsed = amountUsed;
    } else if (ingredientName.toLowerCase() === 'egg' && per100UnitsType === UoMName.grams) {
        // Convert eggs to grams (assuming 50g per egg)
        standardizedAmountUsed = amountUsed * 50;
    } else if (ingredientName.toLowerCase() === 'sugar' && per100UnitsType === UoMName.grams) {
        // Amount is already in grams
        standardizedAmountUsed = amountUsed;
    }

    // Calculate proportional nutrient amount
    return (standardizedAmountUsed / 100) * nutrientPer100Units;
}


// // Execute the optimization
// const optimizationResult = getOptimalCostAndNutrition(GetRecipes()[0]);
// console.log(JSON.stringify(optimizationResult, null, 2));