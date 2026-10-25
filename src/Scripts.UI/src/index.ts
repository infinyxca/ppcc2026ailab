// Rollup bundles this entry as the UMD global WarehouseScripts (web resource lab_main.js),
// so form and ribbon handlers are registered as WarehouseScripts.<Class>.<method>.
// Scripts assist, the server decides: nothing here compares stock.

export class TransactionForm {
    /**
     * OnLoad handler for the Warehouse Transaction main form.
     * Defaults Transaction Date to now on a new transaction; an existing date is left alone.
     */
    public static onLoad(executionContext: Xrm.Events.EventContext): void {
        const formContext = executionContext.getFormContext();

        const dateAttr = formContext.getAttribute("lab_transactiondate") as Xrm.Attributes.DateAttribute;
        if (dateAttr && !dateAttr.getValue()) {
            dateAttr.setValue(new Date());
        }
    }

    /**
     * OnChange handler for lab_quantity.
     * Total Value = quantity × the selected item's unit price. Without a price, or when the
     * lookup fails, Total Value is left unchanged and no error is shown.
     */
    public static async onQuantityChange(executionContext: Xrm.Events.EventContext): Promise<void> {
        const formContext = executionContext.getFormContext();

        const quantity = (formContext.getAttribute("lab_quantity") as Xrm.Attributes.NumberAttribute)?.getValue();
        const itemVal = (formContext.getAttribute("lab_itemid") as Xrm.Attributes.LookupAttribute)?.getValue();

        if (quantity == null || !itemVal || !itemVal.length) {
            return;
        }

        try {
            const item = await Xrm.WebApi.retrieveRecord(
                "lab_warehouseitem",
                itemVal[0].id.replace(/[{}]/g, ""),
                "?$select=lab_unitprice"
            );
            const unitPrice = item["lab_unitprice"] as number | null;
            if (unitPrice != null) {
                (formContext.getAttribute("lab_totalvalue") as Xrm.Attributes.NumberAttribute)?.setValue(quantity * unitPrice);
            }
        } catch {
            // Item not found or not readable: leave Total Value unchanged
        }
    }
}

export class RibbonActions {
    /**
     * Check Stock Levels (Item form command bar, PrimaryControl parameter).
     * Opens a Stock Check alert with the item's quantity against its reorder point.
     */
    public static async checkStockLevels(formContext: Xrm.FormContext): Promise<void> {
        const name = (formContext.getAttribute("lab_name") as Xrm.Attributes.StringAttribute)?.getValue() || "Unknown";
        const qty = (formContext.getAttribute("lab_availablequantity") as Xrm.Attributes.NumberAttribute)?.getValue() ?? 0;
        const reorder = (formContext.getAttribute("lab_reorderpoint") as Xrm.Attributes.NumberAttribute)?.getValue() ?? 0;

        let message = "Stock level for " + name + ": " + qty + " units.";
        if (qty <= reorder) {
            message += "\n⚠ Below reorder point (" + reorder + "). Consider restocking.";
        } else {
            message += "\n✓ Stock is above reorder point (" + reorder + ").";
        }

        await Xrm.Navigation.openAlertDialog({ text: message, title: "Stock Check" });
    }
}

export { GridApi, LocationForm } from './GridCustomizer';
