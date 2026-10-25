import { useEffect, useRef, useState } from "react";
import { Lab_warehouseitemsService } from "@/generated/services/Lab_warehouseitemsService";
import { OpenFoodFactsService } from "@/generated/services/OpenFoodFactsService";
import type { Product } from "@/generated/models/OpenFoodFactsModel";
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import {
  Body1,
  Button,
  Card,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  Spinner,
  Subtitle2,
} from "@fluentui/react-components";
import { BarcodeScannerRegular } from "@fluentui/react-icons";
import { TextField, usePcfContext } from "@talxis/base-controls";
import { useBarcodeCamera } from "@/hooks/UseBarcodeCamera";
import { useToast } from "@/hooks/use-toast";
import { toBytes, bytesToDataUrl } from "@/utils/Binary";
import { eanError } from "@/utils/Barcode";
import { ensureProductRecord } from "@/utils/ProductRecords";
import { servicePayload, serviceResult } from "@/utils/ServicePayload";
import { errorText } from "@/utils/StockTransactions";
import { useStyles } from "@/styles/BarcodeScanDialog.styles";

const NOT_FOUND = "No product found for this barcode";

type BarcodeScanDialogProps = {
  itemId: string;
  /** The item's current _lab_productid_value, if it's already linked to a Product. */
  currentProductId?: string;
  onLinked: () => void;
};

// A camera scan and a typed barcode both go through handleEan, so there is exactly one place that
// decides what a barcode means. The typed field is always there: devices without a camera depend on it.
export default function BarcodeScanDialog({ itemId, currentProductId, onLinked }: BarcodeScanDialogProps) {
  const styles = useStyles();
  const toast = useToast();
  const context = usePcfContext();
  const [open, setOpen] = useState(false);
  const [ean, setEan] = useState("");
  const eanMessage = eanError(ean);
  const [looking, setLooking] = useState(false);
  const [linking, setLinking] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  // The image proxied through the connector for the barcode just looked up: a data: URI for the
  // preview, and the bytes it came from so linkProduct() can upload them without fetching again.
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [imageBytes, setImageBytes] = useState<Uint8Array | null>(null);
  // A callback ref, not useRef: the decode effect must not start before the <video> is mounted,
  // and state (unlike a ref) retriggers the effect once it is.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  // Once a lookup has produced a product, a late camera decode (a misread off a bad frame) must
  // not silently replace it.
  const productFoundRef = useRef(false);

  // A fresh scan starts every time the dialog opens
  useEffect(() => {
    if (open) productFoundRef.current = false;
  }, [open]);

  const cameraStatus = useBarcodeCamera(videoEl, open, (text) => {
    if (productFoundRef.current) return;
    setEan(text);
    void handleEan(text);
  });

  const handleEan = async (barcode: string) => {
    if (!barcode || eanError(barcode)) return;
    setLooking(true);
    setProduct(null);
    setLookupError(null);
    setImgError(false);
    setPreviewImageUrl(null);
    setImageBytes(null);
    try {
      // The connector answers an unknown barcode with 404, which the service reports as a failure
      const result = await OpenFoodFactsService.GetProductByBarcode(barcode);
      if (!result.success || !result.data) {
        setLookupError(NOT_FOUND);
        return;
      }
      setProduct(result.data);
      productFoundRef.current = true;
      // The lookup is what Look Up promises: stop its spinner here and give the slower image fetch
      // its own loading state
      setLooking(false);

      if (result.data.imageUrl) {
        // A code app's CSP blocks an <img> pointed at an external URL: proxy the bytes through
        // the connector and render them from a data: URI
        setImageLoading(true);
        try {
          const bytes = await fetchProductImageBytes(result.data.imageUrl);
          if (bytes) {
            setImageBytes(bytes);
            setPreviewImageUrl(bytesToDataUrl(bytes, "image/jpeg"));
          } else {
            setImgError(true);
          }
        } catch {
          // The product data is already shown; fall back to "no image"
          setImgError(true);
        } finally {
          setImageLoading(false);
        }
      }
    } catch (err) {
      setLookupError("Lookup failed: " + errorText(err));
    } finally {
      setLooking(false);
    }
  };

  const fetchProductImageBytes = async (imageUrl: string): Promise<Uint8Array | null> => {
    const result = await OpenFoodFactsService.GetProductImage(imageUrl);
    if (!result.success || !result.data) return null;
    return toBytes(result.data);
  };

  // Three separate operations, no rollback between them: find or create the Product, link it to the
  // item, upload its image. If the upload fails, the Product and the link stand.
  const linkProduct = async () => {
    if (!product || !ean) return;
    setLinking(true);
    try {
      const productId = await ensureProductRecord(ean, product);
      if (!productId) {
        toast.error("Could not resolve a Product record to link");
        return;
      }

      await serviceResult(Lab_warehouseitemsService.update(itemId, servicePayload({
        "lab_productid@odata.bind": `/lab_products(${productId})`,
      })));

      if (imageBytes) {
        try {
          // The generated services emit nothing for file columns; the runtime client they are
          // built on does. It reports failures as { success: false } rather than throwing.
          const upload = await getClient(dataSourcesInfo).uploadFileToRecord(
            "lab_products",
            productId,
            "lab_productimage",
            `${ean}.jpg`,
            imageBytes
          );
          if (!upload.success) {
            throw upload.error ?? new Error("upload rejected");
          }
        } catch (err) {
          toast.error("Product linked, but its image failed to save: " + errorText(err));
        }
      }

      toast.success("Product linked to item");
      onLinked();
      resetAndClose();
    } catch (err) {
      toast.error("Failed to link product: " + errorText(err));
    } finally {
      setLinking(false);
    }
  };

  const resetAndClose = () => {
    setOpen(false);
    setEan("");
    setProduct(null);
    setLookupError(null);
    setPreviewImageUrl(null);
    setImageBytes(null);
  };

  return (
    <>
      <Button
        appearance="outline"
        size="small"
        icon={<BarcodeScannerRegular />}
        data-testid="scan-barcode-button"
        onClick={() => setOpen(true)}
      >
        {currentProductId ? "Rescan Barcode" : "Scan Barcode"}
      </Button>

      <Dialog open={open} onOpenChange={(_, data) => (data.open ? setOpen(true) : resetAndClose())}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Scan Product Barcode</DialogTitle>

            <DialogContent className={styles.content}>
              <video
                ref={setVideoEl}
                className={styles.video}
                muted
                autoPlay
                playsInline
              />
              {cameraStatus === "unavailable" && (
                <Body1 className={styles.hint} data-testid="scan-camera-unavailable">
                  No camera available. Type the barcode below instead.
                </Body1>
              )}

              {/* The TextField only underlines its error in red; the message itself shows on the Field */}
              <Field
                label="EAN / UPC barcode"
                validationState={eanMessage ? "error" : "none"}
                validationMessage={eanMessage}
              >
                <div className={styles.eanRow}>
                  <div className={styles.eanInput}>
                    <TextField
                      context={context}
                      parameters={{
                        value: { raw: ean, type: "SingleLine.Text", error: !!eanMessage, errorMessage: eanMessage },
                        Placeholder: { raw: "e.g. 3017620422003" },
                      }}
                      onNotifyOutputChanged={(outputs) => setEan(outputs.value ?? "")}
                      // The control reports its value on blur; mirror keystrokes too, so Look Up
                      // enables while the barcode is still being typed
                      onOverrideComponentProps={(props) => ({
                        ...props,
                        id: "scanEan",
                        "data-testid": "scan-ean-input",
                        onChange: (event, value) => {
                          props.onChange?.(event, value);
                          setEan(value ?? "");
                        },
                      })}
                    />
                  </div>
                  <Button
                    type="button"
                    appearance="primary"
                    data-testid="scan-lookup-button"
                    disabled={!ean || !!eanMessage || looking}
                    onClick={() => void handleEan(ean)}
                  >
                    {looking ? <Spinner size="tiny" /> : "Look Up"}
                  </Button>
                </div>
              </Field>

              {lookupError && (
                <MessageBar intent={lookupError === NOT_FOUND ? "warning" : "error"} data-testid="scan-lookup-error">
                  <MessageBarBody>{lookupError}</MessageBarBody>
                </MessageBar>
              )}

              {product && (
                <Card className={styles.product}>
                  {imageLoading && (
                    <div className={styles.imagePlaceholder}>
                      <Spinner size="tiny" />
                    </div>
                  )}
                  {previewImageUrl && !imgError && (
                    <img
                      src={previewImageUrl}
                      alt={product.name ?? ean}
                      className={styles.image}
                      onError={() => setImgError(true)}
                    />
                  )}
                  <div className={styles.productText}>
                    <Subtitle2 data-testid="scan-product-name">
                      {product.name ?? "Unknown product"}
                    </Subtitle2>
                    <Caption1 className={styles.muted}>
                      {[product.brand, product.quantity].filter(Boolean).join(" · ")}
                    </Caption1>
                  </div>
                </Card>
              )}
            </DialogContent>

            <DialogActions>
              <Button type="button" appearance="secondary" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button
                type="button"
                appearance="primary"
                data-testid="scan-link-button"
                disabled={!product || linking}
                onClick={() => void linkProduct()}
              >
                {linking ? <Spinner size="tiny" /> : "Link to Item"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
