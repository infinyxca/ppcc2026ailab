import { useState } from "react";
import { Button, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { Lab_warehouseitemsService } from "@/generated/services/Lab_warehouseitemsService";
import { ItemPicker } from "@/components/mobile/ItemPicker";
import { ItemSummary } from "@/components/mobile/ItemSummary";
import { MobilePage } from "@/components/mobile/MobilePage";
import { QuantityStepper } from "@/components/mobile/QuantityStepper";
import { ResultPanel } from "@/components/mobile/ResultPanel";
import type { PickItem } from "@/hooks/UsePickItems";
import { errorText, useStockTransaction } from "@/utils/StockTransactions";
import { serviceResult } from "@/utils/ServicePayload";
import { useStyles } from "@/styles/QuickTransaction.styles";

type Mode = "receive" | "pick";

const CONFIG = {
  receive: { title: "Receive stock", verb: "Receive", past: "Received", type: "inbound" },
  pick: { title: "Pick stock", verb: "Pick", past: "Picked", type: "outbound" },
} as const;

// Receive and Pick are the same flow in opposite directions: choose an item, set a quantity, confirm.
// The app only asks for a quantity; whether the stock allows it is the server's decision, and a refused
// pick shows the server's message unchanged.
function QuickTransactionFlow({ mode }: { mode: Mode }) {
  const styles = useStyles();
  const config = CONFIG[mode];
  const stock = useStockTransaction();
  const [item, setItem] = useState<PickItem | null>(null);
  const [quantity, setQuantity] = useState<number | null>(1);
  const [result, setResult] = useState<{ title: string; detail: string } | null>(null);

  const restart = () => {
    setItem(null);
    setQuantity(1);
    setResult(null);
    stock.reset();
  };

  if (result) {
    return (
      <MobilePage title={config.title}>
        <ResultPanel title={result.title} detail={result.detail} onAgain={restart} />
      </MobilePage>
    );
  }

  if (!item) {
    return (
      <MobilePage title={config.title}>
        <ItemPicker onSelect={setItem} />
      </MobilePage>
    );
  }

  const valid = quantity !== null && quantity >= 1;

  const confirm = async () => {
    if (!valid) return;
    try {
      await stock.mutateAsync({
        itemId: item.id,
        itemName: item.name,
        type: config.type,
        quantity,
        label: config.verb,
      });
    } catch {
      // Shown below from the mutation's error; the worker can adjust and try again
      return;
    }
    // The quantity on hand as the server has it now, not worked out here
    let detail = item.name;
    try {
      const fresh = await serviceResult(Lab_warehouseitemsService.get(item.id, { select: ["lab_availablequantity"] }));
      detail = `${item.name} - ${Number(fresh.data?.lab_availablequantity)} on hand now`;
    } catch {
      // Saved; only the refreshed quantity is missing
    }
    setResult({ title: `${config.past} ${quantity}`, detail });
  };

  return (
    <MobilePage
      title={config.title}
      footer={
        <Button
          className={styles.confirm}
          appearance="primary"
          size="large"
          disabled={!valid || stock.isPending}
          onClick={() => void confirm()}
          data-testid="flow-confirm"
        >
          {stock.isPending ? "Saving..." : valid ? `${config.verb} ${quantity}` : config.verb}
        </Button>
      }
    >
      <ItemSummary item={item} onChange={restart} />
      <QuantityStepper
        id="quick-quantity"
        label="Quantity"
        value={quantity}
        onChange={setQuantity}
        min={1}
        hint={quantity === null ? "Enter how many" : undefined}
      />
      {stock.error && (
        <MessageBar intent="error" data-testid="flow-error">
          <MessageBarBody>{errorText(stock.error)}</MessageBarBody>
        </MessageBar>
      )}
    </MobilePage>
  );
}

// Keyed by mode so switching between /receive and /pick never carries an item or quantity over
export default function QuickTransactionPage({ mode }: { mode: Mode }) {
  return <QuickTransactionFlow key={mode} mode={mode} />;
}
