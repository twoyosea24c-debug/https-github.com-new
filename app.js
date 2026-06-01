const STORAGE_KEY = "linecode-register-mvp-v1";
const DB_NAME = "linecode-register-db";
const DB_VERSION = 1;
const PAYMENT_METHODS = {
  Square: "square",
  PayPay: "paypay",
  "楽天ペイ": "rakuten_pay",
  "現金": "cash",
  "その他": "other",
};
const PAYMENT_LABELS = Object.fromEntries(Object.entries(PAYMENT_METHODS).map(([label, value]) => [value, label]));
const LINE_DIGIT_PATTERNS = {
  0: "center_dot",
  1: "vertical",
  2: "horizontal",
  3: "vertical_horizontal",
  4: "diagonal_up",
  5: "diagonal_down",
  6: "x_cross",
  7: "mountain",
  8: "valley",
  9: "diamond",
};

const state = {
  products: [],
  cart: [],
  sales: [],
  saleItems: [],
  scanLogs: [],
  settings: {
    shop_name: "",
    code_reuse_enabled: false,
    normal_digit_reading_enabled: true,
    preferred_payment_methods: ["square", "paypay", "rakuten_pay", "cash", "other"],
    quick_price_buttons: [500, 800, 1000, 1200, 1500, 2000],
    receipt_message: "ありがとうございました",
    local_backup_enabled: true,
    created_at: "",
    updated_at: "",
    reuseCodes: false,
    adminMode: false,
    normalScanEnabled: true,
    quickPrices: [500, 800, 1000, 1200, 1500, 2000],
    shopName: "",
    paymentMethods: {
      Square: true,
      PayPay: true,
      "楽天ペイ": true,
      "現金": true,
      "その他": true,
    },
  },
  activeView: "register",
  activeMode: "line",
  lastPhotoDataUrl: "",
  cameraStream: null,
  db: null,
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bootstrapApp();
});

async function bootstrapApp() {
  registerServiceWorker();
  await loadState();
  bindEvents();
  renderAll();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    // PWA登録失敗は販売フローを止めない。
  });
}

function bindElements() {
  document.querySelectorAll("[id]").forEach((el) => {
    els[el.id] = el;
  });
  els.navButtons = [...document.querySelectorAll(".nav")];
  els.modeButtons = [...document.querySelectorAll(".mode")];
}

function bindEvents() {
  els.navButtons.forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.go));
  });
  document.querySelectorAll("[data-mode-shortcut]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.modeShortcut));
  });
  document.querySelectorAll("[data-action='cancel-confirm']").forEach((button) => {
    button.addEventListener("click", () => els.confirmPanel.classList.add("hidden"));
  });

  els.modeButtons.forEach((button) => {
    if (button.dataset.mode) button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  buildManualKeypad();
  els.photoInput.addEventListener("change", handlePhotoInput);
  els.productForm.addEventListener("submit", handleProductSubmit);
  els.reuseCodesInput.addEventListener("change", () => {
    state.settings.reuseCodes = els.reuseCodesInput.checked;
    saveState();
    renderNextCode();
  });
  els.adminModeInput.addEventListener("change", () => {
    state.settings.adminMode = els.adminModeInput.checked;
    saveState();
    renderAll();
  });
  els.inventorySearchInput.addEventListener("input", renderInventory);
  els.inventoryStatusFilter.addEventListener("change", renderInventory);
  els.inventoryCategoryFilter.addEventListener("change", renderInventory);
  els.startCameraButton.addEventListener("click", startCamera);
  els.scanLineButton.addEventListener("click", scanLineDigits);
  els.scanOcrButton.addEventListener("click", scanNormalDigits);
  els.manualLookupButton.addEventListener("click", () => lookupCode(els.manualCodeInput.value, "manual"));
  els.confirmOcrButton.addEventListener("click", () => lookupCode(els.ocrInput.value, "ocr"));
  els.addPriceOnlyButton.addEventListener("click", addPriceOnly);
  els.clearCartButton.addEventListener("click", clearCart);
  els.continueScanButton.addEventListener("click", () => {
    showView("sell");
    setMode("line");
  });
  els.showReceiptButton.addEventListener("click", () => showView("checkout"));
  els.copyAmountButton.addEventListener("click", copyAmount);
  els.openSquareButton.addEventListener("click", () => openPaymentApp("square"));
  els.openPayPayButton.addEventListener("click", () => openPaymentApp("paypay"));
  els.openRakutenButton.addEventListener("click", () => openPaymentApp("rakuten"));
  els.cashRecordButton.addEventListener("click", () => {
    els.paymentMethod.value = "cash";
    els.paymentStatus.textContent = "現金で記録";
  });
  els.goPaymentButton.addEventListener("click", () => showView("payment"));
  els.completeSaleButton.addEventListener("click", completeSale);
  els.nextRegisterButton.addEventListener("click", () => {
    els.issuedPanel.classList.add("hidden");
    els.photoInput.focus();
  });
  els.manualClearButton.addEventListener("click", () => {
    els.manualCodeInput.value = "";
  });
  els.manualBackspaceButton.addEventListener("click", () => {
    els.manualCodeInput.value = els.manualCodeInput.value.slice(0, -1);
  });
  els.saveSettingsButton.addEventListener("click", saveSettingsFromForm);
  els.backupDataButton.addEventListener("click", backupLocalData);
  els.restoreDataInput.addEventListener("change", restoreLocalData);
  els.exportScanLogsButton.addEventListener("click", exportScanLogs);
  els.clearScanLogsButton.addEventListener("click", clearScanLogs);
  els.resetDataButton.addEventListener("click", resetAllData);
  els.resetDemoButton.addEventListener("click", resetAllData);
}

async function loadState() {
  state.db = await openLocalDb();
  const dbData = state.db ? await readAllFromDb() : null;
  const stored = readLocalStorageSnapshot();
  const source = dbData && (dbData.items.length || dbData.sales.length || dbData.cart_items.length) ? dbData : stored;

  if (source) {
    state.settings = normalizeSettings(source.settings || {});
    state.products = (source.items || source.products || []).map(normalizeProduct);
    state.cart = (source.cart_items || source.cart || []).map(normalizeCartItem);
    state.sales = (source.sales || []).map(normalizeSale);
    state.saleItems = source.sale_items || state.sales.flatMap((sale) => sale.items || []);
    state.scanLogs = source.scan_logs || [];
  } else {
    state.settings = normalizeSettings({});
  }
  syncSettingsControls();
  await persistState();
}

function readLocalStorageSnapshot() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveState() {
  return persistState();
}

async function persistState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      items: state.products,
      products: state.products,
      cart: state.cart,
      cart_items: state.cart,
      sales: state.sales,
      sale_items: state.saleItems,
      scan_logs: state.scanLogs,
      settings: state.settings,
    }),
  );
  if (state.db) await writeAllToDb();
}

function openLocalDb() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      ["items", "sales", "sale_items", "cart_items", "settings", "images", "scan_logs"].forEach((store) => {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readAllFromDb() {
  const [items, sales, sale_items, cart_items, settingsRows, scan_logs] = await Promise.all(["items", "sales", "sale_items", "cart_items", "settings", "scan_logs"].map(readStore));
  return {
    items,
    sales,
    sale_items,
    cart_items,
    settings: settingsRows[0] || null,
    scan_logs,
  };
}

function readStore(storeName) {
  return new Promise((resolve) => {
    const tx = state.db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

async function writeAllToDb() {
  const tx = state.db.transaction(["items", "sales", "sale_items", "cart_items", "settings", "scan_logs"], "readwrite");
  replaceStore(tx, "items", state.products);
  replaceStore(tx, "sales", state.sales);
  replaceStore(tx, "sale_items", state.saleItems);
  replaceStore(tx, "cart_items", state.cart);
  replaceStore(tx, "settings", [{ ...state.settings, id: "default" }]);
  replaceStore(tx, "scan_logs", state.scanLogs);
  await waitForTransaction(tx);
}

function replaceStore(tx, storeName, rows) {
  const store = tx.objectStore(storeName);
  store.clear();
  rows.forEach((row) => store.put(row));
}

function waitForTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function syncSettingsControls() {
  if (els.reuseCodesInput) els.reuseCodesInput.checked = Boolean(state.settings.reuseCodes);
  if (els.settingsReuseCodesInput) els.settingsReuseCodesInput.checked = Boolean(state.settings.reuseCodes);
  if (els.adminModeInput) els.adminModeInput.checked = Boolean(state.settings.adminMode);
  if (els.normalScanEnabledInput) els.normalScanEnabledInput.checked = Boolean(state.settings.normalScanEnabled);
  if (els.quickPricesInput) els.quickPricesInput.value = state.settings.quickPrices.join(",");
  if (els.shopNameInput) els.shopNameInput.value = state.settings.shopName;
  if (els.receiptMessageInput) els.receiptMessageInput.value = state.settings.receipt_message;
  document.querySelectorAll("[data-payment-setting]").forEach((input) => {
    input.checked = state.settings.paymentMethods[input.dataset.paymentSetting] !== false;
  });
  renderQuickPriceButtons();
  renderPaymentMethods();
}

function renderAll() {
  syncSettingsControls();
  renderNextCode();
  renderCart();
  renderReceipt();
  renderInventory();
  renderHistory();
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeProduct(product) {
  const code = formatCode(product.item_code || product.code);
  const status = normalizeItemStatus(product.status || (product.sold ? "sold" : "selling"));
  const createdAt = product.created_at || product.createdAt || new Date().toISOString();
  return {
    id: product.id || newId("item"),
    item_code: code,
    code,
    name: product.name || `No.${code}`,
    price: Number(product.price) || 0,
    image_uri: product.image_uri || product.image_url || product.photo || "",
    image_url: product.image_uri || product.image_url || product.photo || "",
    photo: product.image_uri || product.image_url || product.photo || "",
    category: product.category || "",
    memo: product.memo || "",
    status,
    sold: status === "sold",
    created_at: createdAt,
    createdAt,
    updated_at: product.updated_at || createdAt,
    sold_at: product.sold_at || product.soldAt || null,
    deleted_at: product.deleted_at || null,
    code_reuse_blocked: product.code_reuse_blocked !== false,
    sync_status: product.sync_status || "pending_create",
    last_synced_at: product.last_synced_at || null,
  };
}

function normalizeCartItem(item) {
  const quantity = Number(item.quantity || item.qty) || 1;
  const price = Number(item.price_at_sale || item.price) || 0;
  return {
    id: item.id || newId("cart"),
    type: item.type || (item.line_type === "manual_price" ? "price" : "product"),
    item_id: item.item_id || item.itemId || "",
    item_code: item.item_code || item.code || null,
    item_name: item.item_name || item.name || "価格追加",
    code: item.item_code || item.code || "---",
    name: item.item_name || item.name || "価格追加",
    price,
    quantity,
    qty: quantity,
    subtotal: price * quantity,
    line_type: item.line_type || (item.type === "price" ? "manual_price" : "item"),
    image_uri: item.image_uri || "",
    added_at: item.added_at || new Date().toISOString(),
  };
}

function normalizeSale(sale) {
  const soldAt = sale.sold_at || sale.at || sale.created_at || new Date().toISOString();
  return {
    id: sale.id || newId("sale"),
    sale_no: sale.sale_no || sale.id || nextSaleNo(soldAt),
    sold_at: soldAt,
    at: soldAt,
    total_amount: Number(sale.total_amount || sale.total) || 0,
    total: Number(sale.total_amount || sale.total) || 0,
    payment_method: normalizePaymentMethod(sale.payment_method || sale.method || "other"),
    method: PAYMENT_LABELS[normalizePaymentMethod(sale.payment_method || sale.method || "other")],
    status: sale.status || "completed",
    receipt_image_uri: sale.receipt_image_uri || null,
    created_at: sale.created_at || soldAt,
    updated_at: sale.updated_at || soldAt,
    sync_status: sale.sync_status || "pending_create",
    last_synced_at: sale.last_synced_at || null,
    items: (sale.items || []).map(normalizeCartItem),
  };
}

function normalizeSettings(settings) {
  const now = new Date().toISOString();
  const preferred = settings.preferred_payment_methods || labelsToPaymentMethods(settings.paymentMethods) || ["square", "paypay", "rakuten_pay", "cash", "other"];
  const quickPrices = settings.quick_price_buttons || settings.quickPrices || [500, 800, 1000, 1200, 1500, 2000];
  const normalized = {
    id: "default",
    shop_name: settings.shop_name ?? settings.shopName ?? "",
    code_reuse_enabled: Boolean(settings.code_reuse_enabled ?? settings.reuseCodes ?? false),
    normal_digit_reading_enabled: settings.normal_digit_reading_enabled ?? settings.normalScanEnabled ?? true,
    preferred_payment_methods: preferred,
    quick_price_buttons: quickPrices,
    receipt_message: settings.receipt_message || "ありがとうございました",
    local_backup_enabled: settings.local_backup_enabled ?? true,
    created_at: settings.created_at || now,
    updated_at: settings.updated_at || now,
    adminMode: Boolean(settings.adminMode),
  };
  normalized.reuseCodes = normalized.code_reuse_enabled;
  normalized.normalScanEnabled = normalized.normal_digit_reading_enabled;
  normalized.quickPrices = normalized.quick_price_buttons;
  normalized.shopName = normalized.shop_name;
  normalized.paymentMethods = paymentMethodsToLabels(normalized.preferred_payment_methods);
  return normalized;
}

function normalizeItemStatus(status) {
  if (status === "available") return "selling";
  return ["selling", "sold", "hidden"].includes(status) ? status : "selling";
}

function normalizePaymentMethod(method) {
  return PAYMENT_METHODS[method] || method || "other";
}

function labelsToPaymentMethods(methods) {
  if (!methods) return null;
  return Object.entries(methods)
    .filter(([, enabled]) => enabled)
    .map(([label]) => PAYMENT_METHODS[label] || label);
}

function paymentMethodsToLabels(methods) {
  return Object.fromEntries(Object.entries(PAYMENT_METHODS).map(([label, value]) => [label, methods.includes(value)]));
}

function productCode(product) {
  return product.item_code || product.code;
}

function productPhoto(product) {
  return product.image_uri || product.image_url || product.photo;
}

function productStatus(product) {
  return normalizeItemStatus(product.status || (product.sold ? "sold" : "selling"));
}

function statusLabel(status) {
  return { selling: "販売中", available: "販売中", sold: "販売済み", hidden: "非表示" }[status] || status;
}

function buildManualKeypad() {
  if (!els.manualKeypad) return;
  els.manualKeypad.textContent = "";
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""].forEach((digit) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = digit;
    button.disabled = digit === "";
    if (digit) {
      button.addEventListener("click", () => {
        els.manualCodeInput.value = (els.manualCodeInput.value + digit).slice(0, 3);
      });
    }
    els.manualKeypad.appendChild(button);
  });
}

function renderQuickPriceButtons() {
  const targets = [
    [els.registerQuickPrices, els.priceInput],
    [els.priceQuickPrices, els.priceOnlyInput],
  ];
  targets.forEach(([container, input]) => {
    if (!container) return;
    container.textContent = "";
    state.settings.quickPrices.forEach((price) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = money(price);
      button.addEventListener("click", () => {
        input.value = price;
      });
      container.appendChild(button);
    });
  });
}

function renderPaymentMethods() {
  if (!els.paymentMethod) return;
  const current = els.paymentMethod.value;
  els.paymentMethod.textContent = "";
  state.settings.preferred_payment_methods.forEach((value) => {
    const method = PAYMENT_LABELS[value] || value;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = method;
    els.paymentMethod.appendChild(option);
  });
  if ([...els.paymentMethod.options].some((option) => option.value === current)) {
    els.paymentMethod.value = current;
  }
}

function formatCode(value) {
  return String(Number(value || 0)).padStart(3, "0").slice(-3);
}

function money(value) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value || 0);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("ja-JP") : "-";
}

function nextProductCode() {
  const used = new Set(
    state.products
      .filter((product) => !product.deleted_at)
      .filter((product) => !state.settings.code_reuse_enabled || product.code_reuse_blocked || productStatus(product) === "selling")
      .map((product) => productCode(product)),
  );
  for (let i = 1; i <= 999; i += 1) {
    const code = formatCode(i);
    if (!used.has(code)) return code;
  }
  return "";
}

function showView(view) {
  if ((view === "checkout" || view === "payment") && !hasCartItems()) {
    if (els.confirmPanel) {
      showMessage(els.confirmPanel, "カートが空です。商品を追加してから支払いへ進んでください。");
    }
    view = "sell";
  }
  state.activeView = view;
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  els.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (view === "checkout") renderReceipt();
  if (view === "payment") renderPayment();
}

function setMode(mode) {
  if (mode === "ocr" && !state.settings.normalScanEnabled) {
    showMessage(els.confirmPanel, "通常数字読み取りは設定で無効です。線数字または手入力を使用してください。");
    return;
  }
  state.activeMode = mode;
  els.modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  document.querySelectorAll(".mode-panel").forEach((panel) => panel.classList.remove("active"));
  document.getElementById(`${mode}Mode`).classList.add("active");
  if (mode === "ocr" && state.cameraStream) els.ocrCameraMirror.srcObject = state.cameraStream;
}

async function handlePhotoInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.lastPhotoDataUrl = await imageFileToThumbnail(file);
  els.photoPreview.src = state.lastPhotoDataUrl;
  els.photoPreview.classList.remove("hidden");
}

function imageFileToThumbnail(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 640;
        const ratio = Math.min(size / img.width, size / img.height, 1);
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function handleProductSubmit(event) {
  event.preventDefault();
  const code = nextProductCode();
  if (!code) {
    showMessage(els.issuedPanel, "登録上限の999件に達しました。");
    return;
  }
  const price = Number(els.priceInput.value);
  if (!state.lastPhotoDataUrl) {
    showMessage(els.issuedPanel, "商品写真を選択してください。");
    return;
  }
  if (!Number.isFinite(price) || price <= 0) {
    showMessage(els.issuedPanel, "価格は1円以上で入力してください。");
    return;
  }
  const now = new Date().toISOString();

  const product = normalizeProduct({
    id: newId("item"),
    item_code: code,
    code,
    image_uri: state.lastPhotoDataUrl,
    price,
    name: els.nameInput.value.trim() || `No.${code}`,
    category: els.categoryInput.value.trim(),
    memo: els.memoInput.value.trim(),
    status: "selling",
    created_at: now,
    updated_at: now,
    code_reuse_blocked: true,
    sync_status: "pending_create",
    last_synced_at: null,
  });
  state.products.push(product);
  saveState();

  els.productForm.reset();
  state.lastPhotoDataUrl = "";
  els.photoPreview.classList.add("hidden");
  els.issuedPhoto.src = productPhoto(product);
  els.issuedPhoto.classList.remove("hidden");
  els.issuedCode.textContent = code;
  els.issuedName.textContent = product.name;
  els.issuedPrice.textContent = money(product.price);
  renderLineDigitRow(els.issuedLineDigits, code);
  els.issuedPanel.classList.remove("hidden");
  renderAll();
}

function renderNextCode() {
  els.nextCodeBadge.textContent = `次: ${nextProductCode() || "---"}`;
}

function renderLineDigitRow(container, code) {
  container.textContent = "";
  formatCode(code)
    .split("")
    .forEach((digit) => {
      const node = document.createElement("span");
      node.className = `line-digit digit-${digit}`;
      node.setAttribute("aria-label", digit);
      container.appendChild(node);
    });
}

async function startCamera() {
  if (state.cameraStream) return;
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    els.cameraVideo.srcObject = state.cameraStream;
    if (els.ocrCameraMirror) els.ocrCameraMirror.srcObject = state.cameraStream;
  } catch {
    showCameraFallback("カメラを開始できませんでした。手入力または価格だけ追加を使用してください。");
  }
}

function showCameraFallback(message) {
  els.confirmPanel.classList.remove("warning-panel");
  els.confirmPanel.innerHTML = `
    <h3>${escapeHtml(message)}</h3>
    <div class="button-row">
      <button class="secondary" type="button" data-action="manual">手入力</button>
      <button class="primary" type="button" data-action="price">価格だけ追加</button>
      <button class="secondary" type="button" data-action="cancel">キャンセル</button>
    </div>
  `;
  els.confirmPanel.querySelector("[data-action='manual']").addEventListener("click", () => setMode("manual"));
  els.confirmPanel.querySelector("[data-action='price']").addEventListener("click", () => setMode("price"));
  els.confirmPanel.querySelector("[data-action='cancel']").addEventListener("click", () => els.confirmPanel.classList.add("hidden"));
  els.confirmPanel.classList.remove("hidden");
}

async function scanLineDigits() {
  if (!state.cameraStream) await startCamera();
  const video = els.cameraVideo;
  if (!video.videoWidth) {
    showMessage(els.confirmPanel, "カメラ映像の準備中です。少し待ってから再試行してください。");
    return;
  }

  const canvas = els.scanCanvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const sourceMapper = createVideoSourceMapper(video);
  const digits = [...document.querySelectorAll(".scan-cell")].map((cell) => {
    const source = sourceMapper(cell.getBoundingClientRect());
    const crop = document.createElement("canvas");
    crop.width = Math.max(1, Math.round(source.width));
    crop.height = Math.max(1, Math.round(source.height));
    crop.getContext("2d", { willReadFrequently: true }).drawImage(canvas, source.x, source.y, source.width, source.height, 0, 0, crop.width, crop.height);
    return recognizeLineDigit(crop);
  });

  const code = digits.map((result) => result.digit).join("");
  const lowConfidence = digits.some((result) => result.confidence < 0.12 || result.score < 0.52);
  const orientationRisk = digits.some((result) => result.orientationRisk);
  els.scanStatus.textContent = lowConfidence || orientationRisk ? `判定保留: ${code}` : `仮認識: ${code}`;
  showScanReview(digits, code, lowConfidence || orientationRisk);
}

function showScanReview(digits, code, needsReview) {
  const labels = ["百の位", "十の位", "一の位"];
  els.confirmPanel.classList.remove("warning-panel");
  els.confirmPanel.innerHTML = `
    <h3>${needsReview ? "読み取り結果を確認してください" : "仮認識番号"}</h3>
    <div class="issued-code">${escapeHtml(code)}</div>
    <p class="hint">各桁を必要に応じて修正してから確定してください。自動でカートには追加しません。</p>
    <div class="digit-review-grid">
      ${digits
        .map((result, index) => {
          const candidates = buildDigitCandidates(result);
          return `<label class="field"><span>${labels[index]} / 信頼度 ${Math.round(result.confidence * 100)}</span><select data-digit-index="${index}">${candidates
            .map((digit) => `<option value="${digit}" ${digit === result.digit ? "selected" : ""}>${digit}</option>`)
            .join("")}</select></label>`;
        })
        .join("")}
    </div>
    <div class="button-row">
      <button class="secondary" type="button" data-action="rescan">再読み取り</button>
      <button class="secondary" type="button" data-action="manual">手入力</button>
      <button class="primary" type="button" data-action="confirm-code">この番号で確認</button>
    </div>
  `;
  els.confirmPanel.querySelector("[data-action='rescan']").addEventListener("click", () => els.confirmPanel.classList.add("hidden"));
  els.confirmPanel.querySelector("[data-action='manual']").addEventListener("click", () => setMode("manual"));
  els.confirmPanel.querySelector("[data-action='confirm-code']").addEventListener("click", () => {
    const fixed = [...els.confirmPanel.querySelectorAll("[data-digit-index]")].map((select) => select.value).join("");
    saveScanLog(code, fixed, digits);
    lookupCode(fixed, "line");
  });
  els.confirmPanel.classList.remove("hidden");
}

function buildDigitCandidates(result) {
  const fromScores = (result.candidates || []).map((candidate) => candidate.digit);
  return [...new Set([result.digit, ...fromScores, "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"])];
}

function saveScanLog(rawCode, fixedCode, digits) {
  try {
    state.scanLogs.unshift({
      id: newId("scan"),
      captured_at: new Date().toISOString(),
      raw_code: rawCode,
      corrected_code: fixedCode,
      candidates: digits.map((result) => result.candidates || []),
      confidence: digits.map((result) => result.confidence),
    });
    if (state.scanLogs.length > 200) state.scanLogs.length = 200;
    saveState();
  } catch {
    // ログ保存失敗で販売フローを止めない。
  }
}

function createVideoSourceMapper(video) {
  const rect = video.getBoundingClientRect();
  const videoAspect = video.videoWidth / video.videoHeight;
  const boxAspect = rect.width / rect.height;
  const scale = boxAspect > videoAspect ? rect.width / video.videoWidth : rect.height / video.videoHeight;
  const renderedWidth = video.videoWidth * scale;
  const renderedHeight = video.videoHeight * scale;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;

  return (cellRect) => {
    const x = (cellRect.left - rect.left - offsetX) / scale;
    const y = (cellRect.top - rect.top - offsetY) / scale;
    const width = cellRect.width / scale;
    const height = cellRect.height / scale;
    const clampedX = Math.max(0, Math.min(video.videoWidth - 1, x));
    const clampedY = Math.max(0, Math.min(video.videoHeight - 1, y));
    return {
      x: clampedX,
      y: clampedY,
      width: Math.max(1, Math.min(video.videoWidth - clampedX, width)),
      height: Math.max(1, Math.min(video.videoHeight - clampedY, height)),
    };
  };
}

function recognizeLineDigit(canvas) {
  const analysis = preprocessLineDigit(canvas);
  if (analysis.points.length < 8) {
    return { digit: "0", confidence: 0, score: 0, orientationRisk: true, candidates: [] };
  }

  const scored = Object.entries(lineDigitTemplates())
    .map(([digit, parts]) => ({ digit, ...templateScore(analysis.points, parts, analysis) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  const orientationRisk = analysis.edgeContact > 0.12 || analysis.fillRatio > 0.34 || best.anglePenalty > 0.32 || (["7", "8"].includes(best.digit) && best.score - second.score < 0.2);

  return {
    digit: best.digit,
    confidence: best.score - second.score,
    score: best.score,
    orientationRisk,
    candidates: scored.slice(0, 3),
  };
}

function preprocessLineDigit(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const insetX = Math.max(2, Math.round(width * 0.14));
  const insetY = Math.max(2, Math.round(height * 0.14));
  const workWidth = Math.max(1, width - insetX * 2);
  const workHeight = Math.max(1, height - insetY * 2);
  const lumas = new Array(workWidth * workHeight);

  for (let y = 0; y < workHeight; y += 1) {
    for (let x = 0; x < workWidth; x += 1) {
      const src = ((y + insetY) * width + x + insetX) * 4;
      lumas[y * workWidth + x] = 0.299 * data[src] + 0.587 * data[src + 1] + 0.114 * data[src + 2];
    }
  }

  const binary = lumas.map((value) => value < otsuThreshold(lumas));
  const cleaned = removeNoiseAndBorder(binary, workWidth, workHeight);
  const points = [];
  let edgePixels = 0;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < workHeight; y += 1) {
    for (let x = 0; x < workWidth; x += 1) {
      if (!cleaned[y * workWidth + x]) continue;
      const nx = (x + 0.5) / workWidth;
      const ny = (y + 0.5) / workHeight;
      points.push([nx, ny]);
      minX = Math.min(minX, nx);
      minY = Math.min(minY, ny);
      maxX = Math.max(maxX, nx);
      maxY = Math.max(maxY, ny);
      if (x < 2 || y < 2 || x > workWidth - 3 || y > workHeight - 3) edgePixels += 1;
    }
  }

  return {
    points,
    bounds: { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) },
    fillRatio: points.length / Math.max(1, workWidth * workHeight),
    edgeContact: edgePixels / Math.max(1, points.length),
  };
}

function otsuThreshold(lumas) {
  const hist = new Array(256).fill(0);
  lumas.forEach((value) => {
    hist[Math.max(0, Math.min(255, Math.round(value)))] += 1;
  });
  const total = lumas.length;
  const sum = hist.reduce((acc, count, index) => acc + index * count, 0);
  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return Math.max(35, Math.min(215, threshold));
}

function removeNoiseAndBorder(binary, width, height) {
  const visited = new Uint8Array(binary.length);
  const output = new Array(binary.length).fill(false);
  const minComponentSize = Math.max(5, Math.round(width * height * 0.002));
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let start = 0; start < binary.length; start += 1) {
    if (!binary[start] || visited[start]) continue;
    const stack = [start];
    const component = [];
    let touchesEdge = false;
    visited[start] = 1;

    while (stack.length) {
      const index = stack.pop();
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;

      directions.forEach(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const next = ny * width + nx;
        if (binary[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      });
    }

    if (component.length >= minComponentSize && !touchesEdge) {
      component.forEach((index) => {
        output[index] = true;
      });
    }
  }
  return output;
}

function lineDigitTemplates() {
  return {
    0: [{ type: "dot", x: 0.5, y: 0.5, radius: 0.12 }],
    1: [{ type: "seg", a: [0.5, 0.2], b: [0.5, 0.8] }],
    2: [{ type: "seg", a: [0.2, 0.5], b: [0.8, 0.5] }],
    3: [
      { type: "seg", a: [0.5, 0.2], b: [0.5, 0.8] },
      { type: "seg", a: [0.2, 0.5], b: [0.8, 0.5] },
    ],
    4: [{ type: "seg", a: [0.22, 0.78], b: [0.78, 0.22] }],
    5: [{ type: "seg", a: [0.22, 0.22], b: [0.78, 0.78] }],
    6: [
      { type: "seg", a: [0.2, 0.2], b: [0.8, 0.8] },
      { type: "seg", a: [0.2, 0.8], b: [0.8, 0.2] },
    ],
    7: [
      { type: "seg", a: [0.18, 0.76], b: [0.5, 0.24] },
      { type: "seg", a: [0.82, 0.76], b: [0.5, 0.24] },
    ],
    8: [
      { type: "seg", a: [0.18, 0.24], b: [0.5, 0.76] },
      { type: "seg", a: [0.82, 0.24], b: [0.5, 0.76] },
    ],
    9: [
      { type: "seg", a: [0.5, 0.18], b: [0.82, 0.5] },
      { type: "seg", a: [0.82, 0.5], b: [0.5, 0.82] },
      { type: "seg", a: [0.5, 0.82], b: [0.18, 0.5] },
      { type: "seg", a: [0.18, 0.5], b: [0.5, 0.18] },
    ],
  };
}

function templateScore(points, parts, analysis) {
  const tolerance = 0.09;
  let hits = 0;
  let misses = 0;
  let distanceSum = 0;
  const matchedParts = new Set();

  points.forEach(([x, y]) => {
    const best = parts
      .map((part, index) => ({
        index,
        distance: part.type === "dot" ? Math.max(0, Math.hypot(x - part.x, y - part.y) - part.radius) : segmentDistance([x, y], part.a, part.b),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    distanceSum += best.distance;
    if (best.distance <= tolerance) {
      hits += 1;
      matchedParts.add(best.index);
    } else if (best.distance > tolerance * 2.2) {
      misses += 1;
    }
  });

  const coverage = parts.reduce((sum, part) => sum + partCoverage(points, part), 0) / parts.length;
  const hitRatio = hits / Math.max(1, points.length);
  const missRatio = misses / Math.max(1, points.length);
  const distancePenalty = Math.min(0.45, distanceSum / Math.max(1, points.length));
  const partPenalty = (parts.length - matchedParts.size) / parts.length;
  const boundsPenalty = expectedBoundsPenalty(parts, analysis.bounds);
  const anglePenalty = angleDeviationPenalty(points, parts);
  const densityPenalty = analysis.fillRatio < 0.006 || analysis.fillRatio > 0.28 ? 0.18 : 0;

  return {
    score: hitRatio * 0.42 + coverage * 0.46 - missRatio * 0.16 - distancePenalty * 0.45 - partPenalty * 0.18 - boundsPenalty * 0.16 - anglePenalty * 0.12 - densityPenalty,
    anglePenalty,
  };
}

function partCoverage(points, part) {
  if (part.type === "dot") {
    const near = points.filter(([x, y]) => Math.hypot(x - part.x, y - part.y) < part.radius + 0.05).length;
    return Math.min(1, near / Math.max(6, points.length * 0.45));
  }
  const samples = 16;
  let covered = 0;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const sx = part.a[0] + (part.b[0] - part.a[0]) * t;
    const sy = part.a[1] + (part.b[1] - part.a[1]) * t;
    if (points.some(([x, y]) => Math.hypot(x - sx, y - sy) < 0.11)) covered += 1;
  }
  return covered / (samples + 1);
}

function expectedBoundsPenalty(parts, bounds) {
  const xs = [];
  const ys = [];
  parts.forEach((part) => {
    if (part.type === "dot") {
      xs.push(part.x - part.radius, part.x + part.radius);
      ys.push(part.y - part.radius, part.y + part.radius);
      return;
    }
    xs.push(part.a[0], part.b[0]);
    ys.push(part.a[1], part.b[1]);
  });
  const expected = {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  return Math.min(1, Math.abs(bounds.width - expected.width) + Math.abs(bounds.height - expected.height));
}

function angleDeviationPenalty(points, parts) {
  const lineParts = parts.filter((part) => part.type === "seg");
  if (lineParts.length !== 1 || points.length < 12) return 0;
  const expectedAngles = lineParts.map((part) => Math.atan2(part.b[1] - part.a[1], part.b[0] - part.a[0]));
  const observed = principalAngle(points);
  return Math.min(...expectedAngles.map((angle) => angularDistance(observed, angle))) / (Math.PI / 2);
}

function principalAngle(points) {
  const center = points.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]).map((value) => value / points.length);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  points.forEach(([x, y]) => {
    const dx = x - center[0];
    const dy = y - center[1];
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  });
  return 0.5 * Math.atan2(2 * xy, xx - yy);
}

function angularDistance(a, b) {
  let diff = Math.abs(a - b) % Math.PI;
  if (diff > Math.PI / 2) diff = Math.PI - diff;
  return diff;
}

async function scanNormalDigits() {
  if (!("TextDetector" in window)) {
    showMessage(els.confirmPanel, "このブラウザは通常数字のカメラ読み取りに対応していません。数字を入力して確認へ進んでください。");
    return;
  }
  if (!state.cameraStream) await startCamera();
  const video = els.cameraVideo;
  if (!video.videoWidth) {
    showMessage(els.confirmPanel, "カメラ映像の準備中です。少し待ってから再試行してください。");
    return;
  }

  const canvas = els.scanCanvas;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(video, 0, 0, canvas.width, canvas.height);

  try {
    const detector = new window.TextDetector();
    const detections = await detector.detect(canvas);
    const candidates = detections
      .flatMap((item) => String(item.rawValue || "").match(/\d{1,3}/g) || [])
      .map((value) => formatCode(value));
    const unique = [...new Set(candidates)];
    if (!unique.length) {
      showUnknownResult("---", "通常数字を読み取れませんでした。再読み取りまたは手入力を選んでください。");
      return;
    }
    els.ocrInput.value = unique[0];
    lookupCode(unique[0], "ocr");
  } catch {
    showMessage(els.confirmPanel, "通常数字の読み取りに失敗しました。数字を入力して確認へ進んでください。");
  }
}

function segmentDistance(point, a, b) {
  const [px, py] = point;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function lookupCode(rawCode, source) {
  const digits = String(rawCode || "").replace(/\D/g, "");
  if (!digits) return;
  const code = formatCode(digits);
  const matches = state.products.filter((item) => productCode(item) === code && productStatus(item) !== "hidden" && !item.deleted_at);
  const product = matches.find((item) => productStatus(item) === "selling") || matches[0];
  if (!product) {
    showUnknownResult(code, "未登録の商品番号です。");
    return;
  }
  showProductConfirm(product, source);
}

function showProductConfirm(product, source) {
  const sourceText = source === "ocr" ? "通常数字読み取り" : source === "line" ? "線数字読み取り" : "手入力";
  const status = productStatus(product);
  const isSold = status === "sold";
  if (isSold && !state.settings.adminMode) {
    els.confirmPanel.classList.add("warning-panel");
    els.confirmPanel.innerHTML = `
      <h3>この商品は販売済みです。</h3>
      <p class="warning-text">通常はカートに追加できません。</p>
      <div class="confirm-product">
        <img src="${productPhoto(product)}" alt="">
        <div>
          <small>No.${productCode(product)} / ${statusLabel(status)}</small>
          <h3>${escapeHtml(product.name)}</h3>
          <div class="price">${money(product.price)}</div>
        </div>
      </div>
      <div class="button-row">
        <button class="secondary" type="button" data-action="rescan">再読み取り</button>
        <button class="secondary" type="button" data-action="manual">手入力</button>
        <button class="secondary" type="button" data-action="cancel">キャンセル</button>
      </div>
    `;
    els.confirmPanel.querySelector("[data-action='rescan']").addEventListener("click", () => els.confirmPanel.classList.add("hidden"));
    els.confirmPanel.querySelector("[data-action='manual']").addEventListener("click", () => setMode("manual"));
    els.confirmPanel.querySelector("[data-action='cancel']").addEventListener("click", () => els.confirmPanel.classList.add("hidden"));
    els.confirmPanel.classList.remove("hidden");
    return;
  }
  els.confirmPanel.classList.remove("warning-panel");
  const soldWarning = isSold ? `<p class="warning-text">この商品は販売済みです。通常はカートに追加できません。</p>` : "";
  const adminActions = state.settings.adminMode && isSold ? `<button class="secondary" type="button" data-action="restore">販売中に戻す</button><button class="secondary" type="button" data-action="force-add">管理者追加</button>` : "";
  els.confirmPanel.innerHTML = `
    <div class="confirm-product">
      <img src="${productPhoto(product)}" alt="">
      <div>
        <small>${sourceText} / No.${productCode(product)} / ${statusLabel(status)}</small>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="price">${money(product.price)}</div>
      </div>
    </div>
    ${soldWarning}
    <div class="line-digit-row mini-line" id="confirmLineDigits"></div>
    <div class="button-row">
      <button class="secondary" type="button" data-action="rescan">再読み取り</button>
      ${adminActions}
      <button class="primary" type="button" data-action="add-product" ${isSold ? "disabled" : ""}>カートに追加</button>
    </div>
  `;
  renderLineDigitRow(document.getElementById("confirmLineDigits"), productCode(product));
  els.confirmPanel.querySelector("[data-action='rescan']").addEventListener("click", () => els.confirmPanel.classList.add("hidden"));
  els.confirmPanel.querySelector("[data-action='add-product']").addEventListener("click", () => addProductToCart(product));
  els.confirmPanel.querySelector("[data-action='restore']")?.addEventListener("click", () => updateProductStatus(product.id, "selling"));
  els.confirmPanel.querySelector("[data-action='force-add']")?.addEventListener("click", () => addProductToCart(product, true));
  els.confirmPanel.classList.remove("hidden");
}

function showUnknownResult(code, message) {
  els.confirmPanel.classList.remove("warning-panel");
  els.confirmPanel.innerHTML = `
    <h3>${escapeHtml(message)}</h3>
    <p class="hint">読み取り結果: <strong>${escapeHtml(code)}</strong></p>
    <div class="button-row">
      <button class="secondary" type="button" data-action="rescan">再読み取り</button>
      <button class="secondary" type="button" data-action="manual">手入力</button>
      <button class="primary" type="button" data-action="price">価格だけ追加</button>
      <button class="secondary" type="button" data-action="cancel">キャンセル</button>
    </div>
  `;
  els.confirmPanel.querySelector("[data-action='rescan']").addEventListener("click", () => els.confirmPanel.classList.add("hidden"));
  els.confirmPanel.querySelector("[data-action='manual']").addEventListener("click", () => setMode("manual"));
  els.confirmPanel.querySelector("[data-action='price']").addEventListener("click", () => setMode("price"));
  els.confirmPanel.querySelector("[data-action='cancel']").addEventListener("click", () => els.confirmPanel.classList.add("hidden"));
  els.confirmPanel.classList.remove("hidden");
}

function showMessage(container, message) {
  container.innerHTML = `<p class="warning-text">${escapeHtml(message)}</p>`;
  container.classList.remove("hidden");
}

function addProductToCart(product, force = false) {
  if (productStatus(product) === "sold" && !force) return;
  if (state.cart.some((item) => item.line_type === "item" && item.code === productCode(product))) {
    showMessage(els.confirmPanel, "この商品はすでにカートに入っています。");
    return;
  }
  state.cart.push({
    id: newId("cart"),
    type: "product",
    line_type: "item",
    item_id: product.id,
    item_code: productCode(product),
    item_name: product.name,
    code: productCode(product),
    name: product.name,
    price: product.price,
    quantity: 1,
    qty: 1,
    subtotal: product.price,
    image_uri: productPhoto(product),
    added_at: new Date().toISOString(),
  });
  els.confirmPanel.classList.add("hidden");
  saveState();
  renderAll();
}

function addPriceOnly() {
  const price = Number(els.priceOnlyInput.value);
  if (!Number.isFinite(price) || price <= 0) {
    showMessage(els.confirmPanel, "価格だけ追加の金額は1円以上で入力してください。");
    return;
  }
  const qty = Math.max(1, Number(els.priceOnlyQtyInput.value) || 1);
  state.cart.push({
    id: newId("cart"),
    type: "price",
    line_type: "manual_price",
    item_id: null,
    item_code: "MANUAL",
    item_name: els.priceOnlyNameInput.value.trim() || "価格追加",
    code: "---",
    name: els.priceOnlyNameInput.value.trim() || "価格追加",
    price,
    quantity: qty,
    qty,
    subtotal: price * qty,
    image_uri: "",
    added_at: new Date().toISOString(),
  });
  els.priceOnlyInput.value = "";
  els.priceOnlyNameInput.value = "";
  els.priceOnlyQtyInput.value = "1";
  saveState();
  renderAll();
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
  const total = cartTotal();
  els.cartBadge.textContent = `${count}点`;
  els.cartTotal.textContent = money(total);
  if (els.registerTotalHero) els.registerTotalHero.textContent = money(total);
  els.showReceiptButton.disabled = state.cart.length === 0;
  els.completeSaleButton.disabled = state.cart.length === 0;
  els.clearCartButton.disabled = state.cart.length === 0;
  els.cartList.textContent = "";

  if (state.cart.length === 0) {
    els.cartList.innerHTML = `<li class="hint">カートは空です。</li>`;
    return;
  }

  state.cart.forEach((item) => {
    const li = document.createElement("li");
    li.className = "cart-item";
    li.innerHTML = `
      <div>
        <strong>${escapeHtml(item.code)} ${escapeHtml(item.name)}</strong><br>
        <small>単価 ${money(item.price)} / 数量 ${item.qty} / 小計 ${money(item.price * item.qty)}</small>
        ${
          item.line_type === "manual_price" || item.type === "price"
            ? `<span class="qty-row"><button type="button" data-action="dec">-</button><b>${item.qty}</b><button type="button" data-action="inc">+</button></span>`
            : ""
        }
      </div>
      <button class="remove" type="button" data-action="remove">削除</button>
    `;
    li.querySelector("[data-action='remove']").addEventListener("click", () => removeCartItem(item.id));
    if (item.line_type === "manual_price" || item.type === "price") {
      li.querySelector("[data-action='dec']").addEventListener("click", () => changeQty(item.id, -1));
      li.querySelector("[data-action='inc']").addEventListener("click", () => changeQty(item.id, 1));
    }
    els.cartList.appendChild(li);
  });
}

function removeCartItem(id) {
  state.cart = state.cart.filter((item) => item.id !== id);
  saveState();
  renderAll();
}

function changeQty(id, delta) {
  const item = state.cart.find((entry) => entry.id === id);
  if (!item || (item.line_type !== "manual_price" && item.type !== "price")) return;
  item.qty = Math.max(1, item.qty + delta);
  item.quantity = item.qty;
  item.subtotal = item.price * item.qty;
  saveState();
  renderAll();
}

function clearCart() {
  state.cart = [];
  saveState();
  renderAll();
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function hasCartItems() {
  return state.cart.length > 0;
}

function renderReceipt() {
  els.receiptDate.textContent = new Date().toLocaleString("ja-JP");
  document.querySelectorAll(".receipt-shop").forEach((node) => {
    node.textContent = state.settings.shopName || "HANDMADE MARKET";
  });
  els.receiptItems.textContent = "";
  if (state.cart.length === 0) {
    els.receiptItems.innerHTML = `<li><span>カートは空です</span><strong>${money(0)}</strong></li>`;
  } else {
    state.cart.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `<span><small>${escapeHtml(item.code)}</small><br>${escapeHtml(item.name)}${item.qty > 1 ? ` x ${item.qty}` : ""}</span><strong>${money(item.price * item.qty)}</strong>`;
      els.receiptItems.appendChild(li);
    });
  }
  els.receiptTotal.textContent = money(cartTotal());
  if (els.receiptPayableTotal) els.receiptPayableTotal.textContent = money(cartTotal());
  const receiptMessage = els.receiptPanel.querySelector(".receipt-message") || document.createElement("p");
  receiptMessage.className = "receipt-message";
  receiptMessage.textContent = state.settings.receipt_message || "ありがとうございました";
  els.receiptPanel.appendChild(receiptMessage);
  els.checkoutStatus.textContent = state.cart.length ? "支払い待ち" : "未会計";
}

function renderPayment() {
  renderPaymentMethods();
  els.paymentTotal.textContent = money(cartTotal());
  els.paymentStatus.textContent = state.cart.length ? "支払い待ち" : "未会計";
  els.completeSaleButton.disabled = state.cart.length === 0;
}

async function copyAmount() {
  const value = String(cartTotal());
  try {
    await navigator.clipboard.writeText(value);
    const status = state.activeView === "payment" ? els.paymentStatus : els.checkoutStatus;
    status.textContent = `${money(cartTotal())} コピー済み`;
  } catch {
    const status = state.activeView === "payment" ? els.paymentStatus : els.checkoutStatus;
    status.textContent = `コピー失敗。金額: ${value}`;
  }
}

function openPaymentApp(kind) {
  const total = cartTotal();
  const urls = {
    square: "square://",
    paypay: "paypay://",
    rakuten: "rakutenpay://",
  };
  copyAmount();
  window.location.href = urls[kind];
  els.paymentStatus.textContent = `${money(total)} を外部決済へ`;
}

function nextSaleNo(dateValue = new Date().toISOString()) {
  const date = new Date(dateValue);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const prefix = `${y}${m}${d}`;
  const count = state.sales.filter((sale) => String(sale.sale_no || "").startsWith(prefix)).length + 1;
  return `${prefix}-${String(count).padStart(4, "0")}`;
}

async function completeSale() {
  if (state.cart.length === 0) {
    els.paymentStatus.textContent = "カートが空です";
    return;
  }
  if (!confirm(`${money(cartTotal())} の会計を完了しますか？外部決済が完了していることを確認してください。`)) return;
  const alreadySold = state.cart
    .filter((item) => item.line_type === "item")
    .map((cartItem) => state.products.find((product) => product.id === cartItem.item_id))
    .filter((product) => !product || productStatus(product) !== "selling");
  if (alreadySold.length) {
    showView("sell");
    showMessage(els.confirmPanel, "会計直前に販売済みまたは未確認の商品が見つかりました。カートを確認してください。");
    return;
  }
  const soldAt = new Date().toISOString();
  const saleId = newId("sale");
  const saleNo = nextSaleNo(soldAt);
  const saleItems = state.cart.map((item) => ({
    id: newId("sale_item"),
    sale_id: saleId,
    item_id: item.line_type === "item" ? item.item_id : null,
    item_code: item.line_type === "item" ? item.code : "MANUAL",
    item_name: item.name,
    price_at_sale: item.price,
    quantity: item.qty,
    subtotal: item.price * item.qty,
    line_type: item.line_type || (item.type === "price" ? "manual_price" : "item"),
    created_at: soldAt,
    code: item.code,
    name: item.name,
    price: item.price,
    qty: item.qty,
  }));
  const sale = {
    id: saleId,
    sale_no: saleNo,
    sold_at: soldAt,
    at: soldAt,
    total_amount: cartTotal(),
    total: cartTotal(),
    payment_method: els.paymentMethod.value,
    method: PAYMENT_LABELS[els.paymentMethod.value] || els.paymentMethod.value,
    status: "completed",
    receipt_image_uri: null,
    created_at: soldAt,
    updated_at: soldAt,
    sync_status: "pending_create",
    last_synced_at: null,
    items: saleItems,
  };
  const soldCodes = new Set(saleItems.filter((item) => item.line_type === "item").map((item) => item.item_code));
  state.products.forEach((product) => {
    if (soldCodes.has(productCode(product))) {
      product.status = "sold";
      product.sold = true;
      product.sold_at = soldAt;
      product.updated_at = soldAt;
      product.sync_status = "pending_update";
    }
  });
  state.saleItems.unshift(...saleItems);
  state.sales.unshift(sale);
  state.cart = [];
  await saveState();
  renderAll();
  renderCompleteReceipt(sale);
}

function renderCompleteReceipt(sale) {
  const items = getSaleItems(sale);
  els.completePanel.innerHTML = `
    <p class="receipt-shop">会計完了</p>
    <p class="receipt-date">${new Date(sale.sold_at || sale.at).toLocaleString("ja-JP")} / ${escapeHtml(sale.sale_no || sale.id)} / ${escapeHtml(PAYMENT_LABELS[sale.payment_method] || sale.method || sale.payment_method)}</p>
    <ul class="receipt-items">
      ${items
        .map((item) => `<li><span><small>${escapeHtml(item.item_code || item.code)}</small><br>${escapeHtml(item.item_name || item.name)}${(item.quantity || item.qty) > 1 ? ` x ${item.quantity || item.qty}` : ""}</span><strong>${money(item.subtotal || item.price * item.qty)}</strong></li>`)
        .join("")}
    </ul>
    <div class="receipt-total"><span>合計</span><strong>${money(sale.total_amount || sale.total)}</strong></div>
    <p class="receipt-message">${escapeHtml(state.settings.receipt_message || "ありがとうございました")}</p>
    <button id="shareReceiptButton" class="secondary" type="button">明細画像を共有</button>
    <button id="showHistoryButton" class="secondary" type="button">売上履歴を見る</button>
    <button id="nextSaleButton" class="primary" type="button">次の会計へ</button>
  `;
  els.completePanel.classList.remove("hidden");
  document.getElementById("shareReceiptButton").addEventListener("click", () => shareReceiptImage(sale));
  document.getElementById("showHistoryButton").addEventListener("click", () => showView("history"));
  document.getElementById("nextSaleButton").addEventListener("click", () => {
    els.completePanel.classList.add("hidden");
    showView("sell");
    setMode("line");
  });
  els.checkoutStatus.textContent = "完了";
}

async function shareReceiptImage(sale) {
  const items = getSaleItems(sale);
  const canvas = document.createElement("canvas");
  const width = 720;
  const lineHeight = 42;
  canvas.width = width;
  canvas.height = 250 + items.length * lineHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#201b15";
  ctx.font = "700 32px monospace";
  ctx.textAlign = "center";
  ctx.fillText(state.settings.shopName || "HANDMADE MARKET", width / 2, 52);
  ctx.font = "22px monospace";
  ctx.fillText(`${sale.sale_no || sale.id} ${new Date(sale.sold_at || sale.at).toLocaleString("ja-JP")}`, width / 2, 90);
  ctx.textAlign = "left";
  let y = 140;
  items.forEach((item) => {
    ctx.fillText(`${item.item_code || item.code} ${item.item_name || item.name}`.slice(0, 34), 40, y);
    ctx.textAlign = "right";
    ctx.fillText(money(item.subtotal || item.price * item.qty), width - 40, y);
    ctx.textAlign = "left";
    y += lineHeight;
  });
  ctx.font = "700 42px monospace";
  ctx.fillText("合計", 40, y + 32);
  ctx.textAlign = "right";
  ctx.fillText(money(sale.total_amount || sale.total), width - 40, y + 32);
  ctx.font = "24px monospace";
  ctx.textAlign = "center";
  ctx.fillText(state.settings.receipt_message || "ありがとうございました", width / 2, y + 78);

  canvas.toBlob(async (blob) => {
    const file = new File([blob], `${sale.sale_no || sale.id}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: sale.sale_no || sale.id });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }, "image/png");
}

function getSaleItems(sale) {
  return sale.items?.length ? sale.items : state.saleItems.filter((item) => item.sale_id === sale.id);
}

function renderInventory() {
  renderCategoryFilter();
  const query = (els.inventorySearchInput?.value || "").trim().toLowerCase();
  const statusFilter = els.inventoryStatusFilter?.value || "all";
  const categoryFilter = els.inventoryCategoryFilter?.value || "all";
  const filtered = state.products
    .filter((product) => !product.deleted_at)
    .filter((product) => {
      const haystack = [productCode(product), product.name, String(product.price), statusLabel(productStatus(product))].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (statusFilter === "all" || productStatus(product) === statusFilter) && (categoryFilter === "all" || (product.category || "") === categoryFilter);
    })
    .sort((a, b) => productCode(a).localeCompare(productCode(b)));
  els.inventoryCount.textContent = `${filtered.length}/${state.products.length}件`;
  els.inventoryList.textContent = "";
  if (filtered.length === 0) {
    els.inventoryList.innerHTML = `<p class="hint">登録商品はまだありません。</p>`;
    return;
  }
  filtered.forEach((product) => {
      const status = productStatus(product);
      const card = document.createElement("article");
      card.className = `inventory-card ${status === "sold" ? "sold" : ""} ${status === "hidden" ? "hidden-item" : ""}`;
      card.innerHTML = `
        <img src="${productPhoto(product)}" alt="">
        <div class="inventory-meta">
          <h3>No.${productCode(product)} ${escapeHtml(product.name)}</h3>
          <strong>${money(product.price)}</strong>
          <br><small>${escapeHtml(product.category || "未分類")}</small>
          <br><small>登録: ${formatDate(product.created_at || product.createdAt)} / 販売: ${product.sold_at ? formatDate(product.sold_at) : "-"}</small>
          <span class="state-badge ${status === "sold" ? "sold" : ""} ${status === "hidden" ? "hidden-item" : ""}">${statusLabel(status)}</span>
          <div class="line-digit-row mini-line" data-code="${productCode(product)}"></div>
          ${
            state.settings.adminMode
              ? `<div class="card-actions">
                  <button type="button" class="secondary" data-action="edit">編集</button>
                  <button type="button" class="secondary" data-status="selling">販売中</button>
                  <button type="button" class="secondary" data-status="sold">販売済み</button>
                  <button type="button" class="secondary" data-status="hidden">非表示</button>
                  <button type="button" class="secondary" data-action="delete">削除</button>
                </div>`
              : ""
          }
        </div>
      `;
      renderLineDigitRow(card.querySelector("[data-code]"), productCode(product));
      card.querySelectorAll("[data-status]").forEach((button) => {
        button.addEventListener("click", () => updateProductStatus(product.id, button.dataset.status));
      });
      card.querySelector("[data-action='edit']")?.addEventListener("click", () => editProduct(product.id));
      card.querySelector("[data-action='delete']")?.addEventListener("click", () => softDeleteProduct(product.id));
      els.inventoryList.appendChild(card);
    });
}

function renderCategoryFilter() {
  if (!els.inventoryCategoryFilter) return;
  const current = els.inventoryCategoryFilter.value;
  const categories = [...new Set(state.products.map((product) => product.category).filter(Boolean))].sort();
  els.inventoryCategoryFilter.textContent = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "すべて";
  els.inventoryCategoryFilter.appendChild(all);
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.inventoryCategoryFilter.appendChild(option);
  });
  els.inventoryCategoryFilter.value = categories.includes(current) ? current : "all";
}

function updateProductStatus(productId, status) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const now = new Date().toISOString();
  product.status = status;
  product.sold = status === "sold";
  product.sold_at = status === "sold" ? product.sold_at || now : null;
  product.updated_at = now;
  product.sync_status = "pending_update";
  saveState();
  renderAll();
}

function editProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const name = prompt("商品名", product.name);
  if (name === null) return;
  const priceText = prompt("価格", String(product.price));
  if (priceText === null) return;
  const price = Number(priceText);
  if (!Number.isFinite(price) || price < 0) {
    alert("価格は0以上の数字で入力してください。");
    return;
  }
  const category = prompt("カテゴリ", product.category || "");
  if (category === null) return;
  const memo = prompt("メモ", product.memo || "");
  if (memo === null) return;
  const now = new Date().toISOString();
  product.name = name.trim() || `No.${productCode(product)}`;
  product.price = price;
  product.category = category.trim();
  product.memo = memo.trim();
  product.updated_at = now;
  product.sync_status = "pending_update";
  saveState();
  renderAll();
}

function softDeleteProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product || !confirm("この商品を削除扱いにしますか？販売履歴は残ります。")) return;
  const now = new Date().toISOString();
  product.status = "hidden";
  product.deleted_at = now;
  product.updated_at = now;
  product.sync_status = "pending_delete";
  saveState();
  renderAll();
}

function saveSettingsFromForm() {
  const prices = els.quickPricesInput.value
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .slice(0, 8);
  state.settings.quickPrices = prices.length ? prices : [500, 1000, 1500, 2000];
  state.settings.quick_price_buttons = state.settings.quickPrices;
  state.settings.reuseCodes = els.settingsReuseCodesInput.checked;
  state.settings.code_reuse_enabled = state.settings.reuseCodes;
  state.settings.normalScanEnabled = els.normalScanEnabledInput.checked;
  state.settings.normal_digit_reading_enabled = state.settings.normalScanEnabled;
  state.settings.shopName = els.shopNameInput.value.trim();
  state.settings.shop_name = state.settings.shopName;
  state.settings.receipt_message = els.receiptMessageInput.value.trim() || "ありがとうございました";
  document.querySelectorAll("[data-payment-setting]").forEach((input) => {
    state.settings.paymentMethods[input.dataset.paymentSetting] = input.checked;
  });
  state.settings.preferred_payment_methods = labelsToPaymentMethods(state.settings.paymentMethods);
  state.settings.updated_at = new Date().toISOString();
  saveState();
  renderAll();
}

function backupLocalData() {
  const backup = {
    items: state.products,
    sales: state.sales,
    sale_items: state.saleItems,
    cart_items: state.cart,
    settings: state.settings,
    line_digit_patterns: LINE_DIGIT_PATTERNS,
    scan_logs: state.scanLogs,
    exported_at: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `linecode-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function restoreLocalData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!confirm("バックアップJSONから復元します。現在のローカルデータは置き換わります。続行しますか？")) {
    event.target.value = "";
    return;
  }
  try {
    const data = JSON.parse(await file.text());
    const restored = validateBackupData(data);
    await persistSnapshot(restored);
    renderAll();
    alert("復元しました。");
  } catch (error) {
    alert(`復元に失敗しました: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function validateBackupData(data) {
  if (!data || typeof data !== "object") throw new Error("JSONの形式が不正です。");
  if (!Array.isArray(data.items)) throw new Error("items が見つかりません。");
  if (!Array.isArray(data.sales)) throw new Error("sales が見つかりません。");
  const products = data.items.map(normalizeProduct);
  const sales = data.sales.map(normalizeSale);
  const saleItems = Array.isArray(data.sale_items) ? data.sale_items : [];
  const cart = Array.isArray(data.cart_items) ? data.cart_items.map(normalizeCartItem) : [];
  const settings = normalizeSettings(data.settings || {});
  const scanLogs = Array.isArray(data.scan_logs) ? data.scan_logs : [];
  const invalidCode = products.find((product) => !/^\d{3}$/.test(product.item_code));
  if (invalidCode) throw new Error(`商品番号 ${invalidCode.item_code} が3桁ではありません。`);
  return { products, sales, saleItems, cart, settings, scanLogs };
}

async function persistSnapshot(snapshot) {
  const backup = {
    products: state.products,
    sales: state.sales,
    saleItems: state.saleItems,
    cart: state.cart,
    settings: state.settings,
    scanLogs: state.scanLogs,
  };
  state.products = snapshot.products;
  state.sales = snapshot.sales;
  state.saleItems = snapshot.saleItems;
  state.cart = snapshot.cart;
  state.settings = snapshot.settings;
  state.scanLogs = snapshot.scanLogs;
  try {
    await persistState();
  } catch (error) {
    state.products = backup.products;
    state.sales = backup.sales;
    state.saleItems = backup.saleItems;
    state.cart = backup.cart;
    state.settings = backup.settings;
    state.scanLogs = backup.scanLogs;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: backup.products,
        products: backup.products,
        cart: backup.cart,
        cart_items: backup.cart,
        sales: backup.sales,
        sale_items: backup.saleItems,
        scan_logs: backup.scanLogs,
        settings: backup.settings,
      }),
    );
    throw error;
  }
}

function exportScanLogs() {
  const header = ["id", "captured_at", "raw_code", "corrected_code", "confidence"].join(",");
  const rows = state.scanLogs.map((log) => [log.id, log.captured_at, log.raw_code, log.corrected_code, (log.confidence || []).join("|")].map(csvEscape).join(","));
  downloadText(`scan-logs-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows].join("\n"), "text/csv");
}

function clearScanLogs() {
  if (!confirm("読み取りログを削除しますか？商品・売上データは削除されません。")) return;
  state.scanLogs = [];
  saveState();
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function renderHistory() {
  const completedSales = state.sales.filter((sale) => sale.status === "completed");
  const total = completedSales.reduce((sum, sale) => sum + (sale.total_amount || sale.total), 0);
  const today = new Date().toLocaleDateString("ja-JP");
  const todaySales = completedSales.filter((sale) => new Date(sale.sold_at || sale.at).toLocaleDateString("ja-JP") === today);
  const todayTotal = todaySales
    .reduce((sum, sale) => sum + (sale.total_amount || sale.total), 0);
  const soldCount = state.products.filter((product) => productStatus(product) === "sold").length;
  const byMethod = completedSales.reduce((map, sale) => {
    const method = PAYMENT_LABELS[sale.payment_method] || sale.method || "その他";
    map[method] = (map[method] || 0) + (sale.total_amount || sale.total);
    return map;
  }, {});
  els.salesSummary.textContent = money(total);
  els.historyStats.innerHTML = `
    <div class="stat-card"><small>日別売上</small><strong>${money(todayTotal)}</strong></div>
    <div class="stat-card"><small>今日の取引件数</small><strong>${todaySales.length}件</strong></div>
    <div class="stat-card"><small>販売済み商品数</small><strong>${soldCount}点</strong></div>
    <div class="stat-card"><small>支払い方法別</small><strong>${Object.entries(byMethod)
      .map(([method, amount]) => `${escapeHtml(method)} ${money(amount)}`)
      .join("<br>") || "-"}</strong></div>
  `;
  els.historyList.textContent = "";
  if (state.sales.length === 0) {
    els.historyList.innerHTML = `<p class="hint">売上履歴はまだありません。</p>`;
    return;
  }
  state.sales.forEach((sale) => {
    const items = sale.items || state.saleItems.filter((item) => item.sale_id === sale.id);
    const card = document.createElement("article");
    card.className = "history-card";
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(sale.sale_no || sale.id)}</h3>
        <small>${formatDate(sale.sold_at || sale.at)} / ${escapeHtml(PAYMENT_LABELS[sale.payment_method] || sale.method || sale.payment_method)} / ${items.length}明細 / ${sale.status === "canceled" ? "取消済み" : "完了"}</small>
        <div class="history-detail hidden">${items.map((item) => `<small>${escapeHtml(item.item_code || item.code)} ${escapeHtml(item.item_name || item.name)} x${item.quantity || item.qty} ${money(item.subtotal || item.price * item.qty)}</small>`).join("<br>")}</div>
        <button class="secondary" type="button" data-action="detail">明細を見る</button>
        <button class="secondary" type="button" data-action="share-sale">明細画像を共有</button>
        ${sale.status !== "canceled" ? `<button class="secondary" type="button" data-action="cancel-sale">取引取消</button>` : ""}
      </div>
      <strong>${money(sale.total_amount || sale.total)}</strong>
    `;
    card.querySelector("[data-action='detail']").addEventListener("click", () => {
      card.querySelector(".history-detail").classList.toggle("hidden");
    });
    card.querySelector("[data-action='share-sale']").addEventListener("click", () => shareReceiptImage(sale));
    card.querySelector("[data-action='cancel-sale']")?.addEventListener("click", () => cancelSale(sale.id));
    els.historyList.appendChild(card);
  });
}

async function cancelSale(saleId) {
  const sale = state.sales.find((entry) => entry.id === saleId);
  if (!sale || sale.status === "canceled") return;
  if (!confirm("この取引を取消しますか？登録商品は販売中に戻します。")) return;
  const now = new Date().toISOString();
  const items = sale.items || state.saleItems.filter((item) => item.sale_id === sale.id);
  const saleSoldAt = sale.sold_at || sale.at;
  let skippedRestore = 0;
  items
    .filter((item) => item.line_type === "item")
    .forEach((item) => {
      const product = state.products.find((entry) => entry.id === item.item_id);
      if (!product || product.status !== "sold") return;
      if (product.sold_at && saleSoldAt && product.sold_at !== saleSoldAt) {
        skippedRestore += 1;
        return;
      }
      product.status = "selling";
      product.sold = false;
      product.sold_at = null;
      product.updated_at = now;
      product.sync_status = "pending_update";
    });
  sale.status = "canceled";
  sale.updated_at = now;
  sale.sync_status = "pending_update";
  await saveState();
  renderAll();
  if (skippedRestore > 0) alert("別取引で更新された可能性がある商品は在庫復元しませんでした。商品一覧で状態を確認してください。");
}

function resetAllData() {
  if (!confirm("ローカル保存データをすべて削除しますか？")) return;
  state.products = [];
  state.cart = [];
  state.sales = [];
  state.saleItems = [];
  state.settings.reuseCodes = false;
  state.settings.code_reuse_enabled = false;
  state.settings.adminMode = false;
  localStorage.removeItem(STORAGE_KEY);
  els.issuedPanel.classList.add("hidden");
  els.completePanel.classList.add("hidden");
  renderAll();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
