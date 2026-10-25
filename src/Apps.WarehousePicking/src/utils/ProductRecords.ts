import { Lab_productsService } from "@/generated/services/Lab_productsService";
import type { Product } from "@/generated/models/OpenFoodFactsModel";
import { servicePayload, serviceResult } from "@/utils/ServicePayload";

async function findProductId(ean: string): Promise<string | undefined> {
  const result = await serviceResult(Lab_productsService.getAll({
    select: ["lab_productid"],
    filter: `lab_ean eq '${ean.replace(/'/g, "''")}'`,
    top: 1,
  }));
  return result.data?.[0]?.lab_productid;
}

// Finds the Product record for a barcode, creating it from the catalog data when there is none yet.
// There is no alternate key on EAN, so this is a filter-then-create rather than an upsert: linking the
// same barcode twice reuses the existing Product instead of duplicating it.
export async function ensureProductRecord(ean: string, product: Product): Promise<string | undefined> {
  const existing = await findProductId(ean);
  if (existing) return existing;

  await serviceResult(Lab_productsService.create(servicePayload({
    lab_name: product.name || ean,
    lab_ean: ean,
    lab_brand: product.brand,
    lab_quantity: product.quantity,
    lab_imageurl: product.imageUrl,
    lab_lastsyncedon: new Date().toISOString(),
  })));

  // The create call's response doesn't reliably carry the new id across hosts: read it back by EAN
  return findProductId(ean);
}
