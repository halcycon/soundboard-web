/** Optional Elgato Stream Deck via WebHID (Chromium + secure context). */

const ELGATO = 0x0fd9;
/** Common Stream Deck product IDs */
const PRODUCTS = [0x0060, 0x0063, 0x006c, 0x006d, 0x0080, 0x0090, 0x0084, 0x0086];

export function webHidSupported() {
  return typeof navigator !== 'undefined' && 'hid' in navigator;
}

/**
 * @param {(index: number) => void} onKeyDown
 */
export async function connectStreamDeck(onKeyDown) {
  if (!webHidSupported()) throw new Error('WebHID not supported in this browser');

  const existing = await navigator.hid.getDevices();
  let device =
    existing.find((d) => d.vendorId === ELGATO && PRODUCTS.includes(d.productId)) || null;

  if (!device) {
    const picked = await navigator.hid.requestDevice({
      filters: PRODUCTS.map((productId) => ({ vendorId: ELGATO, productId })),
    });
    device = picked[0] || null;
  }
  if (!device) throw new Error('No Stream Deck selected');
  if (!device.opened) await device.open();

  const handler = (event) => {
    const data = new Uint8Array(event.data.buffer);
    // Report format varies by model; treat non-zero button bytes as presses.
    for (let i = 0; i < data.length; i++) {
      if (data[i] > 0 && i > 0) {
        onKeyDown(i - 1);
        break;
      }
    }
  };
  device.addEventListener('inputreport', handler);
  return {
    device,
    close: async () => {
      device.removeEventListener('inputreport', handler);
      if (device.opened) await device.close();
    },
  };
}
