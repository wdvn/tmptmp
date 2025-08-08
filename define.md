# Recipe Cost & Nutrition Optimizer - Detailed Algorithm

## Overview
This system implements a **Linear Programming-based optimization** to find the cheapest cost for a recipe while calculating the nutritional profile at that optimal cost point.

## Core Algorithm Flow

### Phase 1: Data Preprocessing & Standardization

#### 1.1 Ingredient Extraction & Unit Conversion
```
FOR each line item in recipe:
    ingredient_name = normalize(item.ingredient.name)
    original_amount = item.unitOfMeasure.amount
    original_unit = item.unitOfMeasure.name
    
    // Convert to standard units
    standard_amount = standardizeIngredientAmount(ingredient_name, original_amount, original_unit)
    
    ingredients[ingredient_name] = {
        requiredAmount: standard_amount,
        originalAmount: original_amount,
        originalUnit: original_unit,
        standardUnit: getStandardUnit(ingredient_name)
    }
END FOR
```

**Unit Conversion Logic:**
- **Cream**: cups → millilitres (2 cups × 236.6 = 473.2 ml)
- **Sugar**: cups → millilitres (0.5 cups × 236.6 = 118.3 ml, treating as grams)
- **Eggs**: Already in standard units (whole eggs)

#### 1.2 Product Matching Strategy
```
FUNCTION isProductMatchingIngredient(productName, ingredientName):
    productLower = toLowerCase(productName)
    ingredientLower = toLowerCase(ingredientName)
    
    matchingRules = {
        'cream': ['cream'],
        'egg': ['egg'], 
        'sugar': ['sugar']
    }
    
    keywords = matchingRules[ingredientLower]
    RETURN any(keyword IN productLower for keyword in keywords)
END FUNCTION
```

### Phase 2: Linear Programming Optimization

#### 2.1 Decision Variables Definition
For each ingredient `i` and supplier `j`:
- `x_ij` = amount of ingredient `i` purchased from supplier `j`

#### 2.2 Objective Function (Minimize Cost)
```
Minimize: Σ(i,j) cost_per_unit_ij × x_ij
```

#### 2.3 Constraints
```
FOR each ingredient i:
    Σ(j) x_ij ≥ required_amount_i    // Demand satisfaction
    x_ij ≥ 0                         // Non-negativity
END FOR
```

#### 2.4 Optimization Algorithm Implementation
```
FUNCTION solveLinearProgram(ingredients, convertedAmounts):
    totalCost = 0
    suppliers = {}
    
    // Get all available products
    allProducts = FLATTEN(GetProductsForIngredient(ingredient) for ingredient in ingredients)
    
    FOR each (ingredientName, data) in convertedAmounts:
        bestOption = {
            cost: INFINITY,
            supplier: null,
            product: null,
            pricePerUnit: INFINITY,
            actualAmountNeeded: data.requiredAmount
        }
        
        FOR each product in allProducts:
            IF isProductMatchingIngredient(product.productName, ingredientName):
                FOR each supplierProduct in product.supplierProducts:
                    pricePerUnit = calculatePricePerUnit(supplierProduct, ingredientName)
                    totalCostForOption = data.requiredAmount × pricePerUnit
                    
                    IF totalCostForOption < bestOption.cost:
                        bestOption = {
                            cost: totalCostForOption,
                            supplier: supplierProduct.supplierName,
                            product: product,
                            supplierProduct: supplierProduct,
                            pricePerUnit: pricePerUnit,
                            actualAmountNeeded: data.requiredAmount
                        }
                    END IF
                END FOR
            END IF
        END FOR
        
        IF bestOption.supplier exists:
            totalCost += bestOption.cost
            suppliers[ingredientName] = bestOption
        END IF
    END FOR
    
    RETURN {totalCost, suppliers}
END FUNCTION
```

#### 2.5 Price Per Unit Calculation
```
FUNCTION calculatePricePerUnit(supplierProduct, ingredientName):
    basePrice = supplierProduct.supplierPrice
    packageAmount = supplierProduct.supplierProductUoM.amount
    packageUnit = supplierProduct.supplierProductUoM.name
    
    SWITCH ingredientName:
        CASE 'cream':
            RETURN basePrice / packageAmount  // Price per ml
        CASE 'egg':
            RETURN basePrice / packageAmount  // Price per egg
        CASE 'sugar':
            IF packageUnit == 'kilogram':
                RETURN basePrice / (packageAmount × 1000)  // Price per gram
            ELSE:
                RETURN basePrice / packageAmount
        DEFAULT:
            RETURN basePrice / packageAmount
    END SWITCH
END FUNCTION
```

### Phase 3: Nutrition Calculation at Optimal Cost

#### 3.1 Weight Calculation Strategy
```
FUNCTION calculateTotalRecipeWeight(optimalSolution):
    totalWeight = 0
    
    FOR each (ingredientName, supplier) in optimalSolution.suppliers:
        amountUsed = supplier.actualAmountNeeded
        
        SWITCH ingredientName:
            CASE 'cream':
                weight = amountUsed  // ml ≈ grams (density ≈ 1)
            CASE 'egg':
                weight = amountUsed × 50  // 50g per egg
            CASE 'sugar':
                weight = amountUsed  // ml treated as grams
        END SWITCH
        
        totalWeight += weight
    END FOR
    
    RETURN totalWeight
END FUNCTION
```

#### 3.2 Nutrient Aggregation Algorithm
```
FUNCTION calculateNutritionAtOptimalCost(optimalSolution):
    totalRecipeWeight = calculateTotalRecipeWeight(optimalSolution)
    rawNutrients = {}
    
    // First Pass: Collect all nutrients
    FOR each (ingredientName, supplier) in optimalSolution.suppliers:
        product = supplier.product
        amountUsed = supplier.actualAmountNeeded
        weightInGrams = calculateIngredientWeight(ingredientName, amountUsed)
        
        FOR each nutrient in product.nutrientFacts:
            nutrientName = nutrient.nutrientName
            nutrientAmount = calculateNutrientAmount(nutrient, amountUsed, ingredientName, weightInGrams)
            
            rawNutrients[nutrientName] += nutrientAmount
        END FOR
    END FOR
    
    // Second Pass: Convert to per 100g format
    nutritionProfile = {}
    FOR each (nutrientName, totalAmount) in rawNutrients:
        per100gAmount = (totalAmount / totalRecipeWeight) × 100
        
        // Handle unit conversions
        finalAmount = per100gAmount
        IF nutrientName == "Sodium":
            finalAmount = per100gAmount / 1000  // mg to grams
        END IF
        
        nutritionProfile[nutrientName] = {
            nutrientName: nutrientName,
            quantityAmount: {
                uomAmount: round(finalAmount, 1),
                uomName: "grams",
                uomType: "mass"
            },
            quantityPer: {
                uomAmount: 100,
                uomName: "grams", 
                uomType: "mass"
            }
        }
    END FOR
    
    RETURN nutritionProfile
END FUNCTION
```

#### 3.3 Individual Nutrient Calculation
```
FUNCTION calculateNutrientAmount(nutrient, amountUsed, ingredientName, weightInGrams):
    nutrientPer100Units = nutrient.quantityAmount.amount
    per100UnitsType = nutrient.quantityPer.name
    
    SWITCH ingredientName:
        CASE 'cream':
            IF per100UnitsType == 'millilitres':
                RETURN (amountUsed / 100) × nutrientPer100Units
            ELSE IF per100UnitsType == 'grams':
                RETURN (weightInGrams / 100) × nutrientPer100Units
        CASE 'egg':
            // Always per 100g
            RETURN (weightInGrams / 100) × nutrientPer100Units
        CASE 'sugar':
            IF per100UnitsType == 'millilitres':
                RETURN (amountUsed / 100) × nutrientPer100Units
            ELSE IF per100UnitsType == 'grams':
                RETURN (weightInGrams / 100) × nutrientPer100Units
    END SWITCH
END FUNCTION
```

## Algorithm Complexity Analysis

### Time Complexity
- **Ingredient Processing**: O(n) where n = number of line items
- **Product Matching**: O(m × p × s) where:
    - m = number of ingredients
    - p = number of products
    - s = number of suppliers per product
- **Nutrition Calculation**: O(m × f) where f = average nutrients per product
- **Overall**: O(m × p × s + m × f)

### Space Complexity
- **Ingredient Storage**: O(m)
- **Product Cache**: O(p × s)
- **Nutrition Storage**: O(f)
- **Overall**: O(m + p × s + f)

## Key Design Patterns Used

### 1. Strategy Pattern
- Different unit conversion strategies for different ingredient types
- Different price calculation strategies per ingredient

### 2. Template Method Pattern
- Standard optimization flow with customizable steps for different ingredients

### 3. Factory Pattern
- Product matching factory creates appropriate matchers for ingredient types

## Data Flow Summary

```
Recipe Input
    ↓
[Phase 1: Standardization]
    ↓
Normalized Ingredient Requirements
    ↓
[Phase 2: LP Optimization]
    ↓
Optimal Supplier Selection
    ↓
[Phase 3: Nutrition Calculation]
    ↓
Final Result: {Cost, Nutrition per 100g}
```

## Error Handling Considerations

1. **Missing Products**: Graceful handling when no products match an ingredient
2. **Unit Conversion Failures**: Fallback to original units
3. **Division by Zero**: Check for zero weights before per-100g calculations
4. **Null/Undefined Values**: Defensive programming throughout

This algorithm ensures optimal cost while maintaining accurate nutritional calculations through systematic linear programming principles.