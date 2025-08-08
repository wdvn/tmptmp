import {GetRecipes} from "./supporting-files/data-access";
import { ExpectedRecipeSummary, RunTest } from "./supporting-files/testing";

console.clear();
console.log("Expected Result Is:", ExpectedRecipeSummary);

const recipeData = GetRecipes(); // the list of 1 recipe you should calculate the information for
console.log("Recipe Data:", recipeData);
const recipeSummary: any = {}; // the final result to pass into the test function
/*
 * YOUR CODE GOES BELOW THIS, DO NOT MODIFY ABOVE
 * (You can add more imports if needed)
 * */
import {Recipe,UoMName,SupplierProduct} from "./supporting-files/models";
import {GetProductsForIngredient,GetUnitsData} from "./supporting-files/data-access";
function calPrice(rep:Recipe) :number{
    for (const ingredient of rep.lineItems) {
        const products = GetProductsForIngredient(ingredient.ingredient);
        for (const prod of products) {
            for (const sub of prod.supplierProducts){
                console.log(calculatePricePerBaseUnit(sub,ingredient.unitOfMeasure.uomName));
            }
        }
    }

    return 0;
}
function callNutri(rep:Recipe):any {
    return {}
}
function convertUnits(value: number, fromUnit: UoMName, toUnit: UoMName): number | null {
    // Tìm kiếm trong bảng chuyển đổi
    const conversion = GetUnitsData().find(
        (entry) => entry.fromUnitName === fromUnit && entry.toUnitName === toUnit
    );

    // Nếu tìm thấy hệ số chuyển đổi
    if (conversion) {
        return value * conversion.conversionFactor;
    }

    // Nếu không tìm thấy cặp chuyển đổi trực tiếp, có thể thử tìm kiếm một đơn vị trung gian
    // Tuy nhiên, dựa trên bảng của bạn, các chuyển đổi đều là trực tiếp nên chúng ta sẽ trả về null
    // hoặc có thể throw một lỗi để xử lý tốt hơn.
    console.error(`Không tìm thấy hệ số chuyển đổi từ ${fromUnit} sang ${toUnit}.`);
    return null;
}

function calculatePricePerBaseUnit(product: SupplierProduct, baseUnitName: UoMName): number | null {
    // Lấy giá và thông tin đơn vị của gói sản phẩm
    const price = product.supplierPrice;
    const { uomAmount, uomName } = product.supplierProductUoM;

    // Trường hợp 1: Đơn vị của sản phẩm đã là đơn vị cơ sở
    if (uomName === baseUnitName) {
        return price / uomAmount;
    }

    // Trường hợp 2: Cần chuyển đổi đơn vị
    const amountInBaseUnit = convertUnits(uomAmount, uomName, baseUnitName);

    if (amountInBaseUnit !== null) {
        // Trả về giá trên mỗi đơn vị cơ sở
        return price / amountInBaseUnit;
    }

    // Trả về null nếu không tìm thấy cách chuyển đổi
    console.error(`Không thể chuyển đổi từ ${uomName} sang ${baseUnitName} để tính toán giá.`);
    return null;
}
for (const recipe of recipeData) {
    recipeSummary[recipe.recipeName]={
        cheapestCost: calPrice(recipe),
        nutrientsAtCheapestCost: callNutri(recipe),
    }
}

/*
 * YOUR CODE ABOVE THIS, DO NOT MODIFY BELOW
 * */
RunTest(recipeSummary);

