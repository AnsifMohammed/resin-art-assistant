import { useState, useMemo } from "react";
import {
  Plus,
  Search,
  SlidersHorizontal,
  Clock,
  Sparkles,
  Package,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { mockProducts, type Product } from "../data/mockData.ts";
import { SlideOver } from "../components/shared/SlideOver.tsx";
import { ConfirmDialog } from "../components/shared/ConfirmDialog.tsx";
import { SampleDataBadge } from "../components/shared/SampleDataBadge.tsx";

const PRESET_IMAGES = [
  "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1615529182904-14819c35db37?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&auto=format&fit=crop&q=80",
];

export default function Catalogue() {
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [searchQuery, setSearchQuery] = useState("");
  const [customizableOnly, setCustomizableOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "price-asc" | "price-desc" | "lead-time">("name");

  // Selection & SlideOver state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Form state for Add/Edit
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState<number>(1200);
  const [formLeadTime, setFormLeadTime] = useState<number>(5);
  const [formCustomizable, setFormCustomizable] = useState(true);
  const [formSizes, setFormSizes] = useState<string[]>([]);
  const [formOptions, setFormOptions] = useState<string[]>([]);
  const [formImage, setFormImage] = useState("");

  // Input draft states for chip inputs
  const [sizeDraft, setSizeDraft] = useState("");
  const [optionDraft, setOptionDraft] = useState("");

  // Filter & sort products
  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      if (customizableOnly && !p.isCustomizable) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSizes = p.sizes?.some((s) => s.toLowerCase().includes(q));
        const matchOptions = p.options.some((o) => o.toLowerCase().includes(q));
        return matchName || matchSizes || matchOptions;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "price-asc") return a.price - b.price;
      if (sortBy === "price-desc") return b.price - a.price;
      if (sortBy === "lead-time") return a.leadTimeDays - b.leadTimeDays;
      return 0;
    });

    return result;
  }, [products, customizableOnly, searchQuery, sortBy]);

  // Open product detail
  const handleOpenDetail = (p: Product) => {
    setSelectedProduct(p);
    setIsEditing(false);
    setIsAddingNew(false);
  };

  // Switch to edit mode
  const handleStartEdit = (p: Product) => {
    setSelectedProduct(p);
    setFormName(p.name);
    setFormPrice(p.price);
    setFormLeadTime(p.leadTimeDays);
    setFormCustomizable(p.isCustomizable);
    setFormSizes(p.sizes || []);
    setFormOptions(p.options || []);
    setFormImage(p.image);
    setIsEditing(true);
    setIsAddingNew(false);
  };

  // Open add modal
  const handleStartAdd = () => {
    setSelectedProduct(null);
    setFormName("");
    setFormPrice(1200);
    setFormLeadTime(5);
    setFormCustomizable(true);
    setFormSizes(["Standard"]);
    setFormOptions(["Colour", "Name engraving"]);
    setFormImage(PRESET_IMAGES[Math.floor(Math.random() * PRESET_IMAGES.length)] || PRESET_IMAGES[0] || "");
    setIsAddingNew(true);
    setIsEditing(true);
  };

  // Close SlideOver
  const handleCloseSlideOver = () => {
    setSelectedProduct(null);
    setIsEditing(false);
    setIsAddingNew(false);
    setSizeDraft("");
    setOptionDraft("");
  };

  // Add chip helper
  const handleAddSizeChip = () => {
    const trimmed = sizeDraft.trim();
    if (trimmed && !formSizes.includes(trimmed)) {
      setFormSizes([...formSizes, trimmed]);
      setSizeDraft("");
    }
  };

  const handleAddOptionChip = () => {
    const trimmed = optionDraft.trim();
    if (trimmed && !formOptions.includes(trimmed)) {
      setFormOptions([...formOptions, trimmed]);
      setOptionDraft("");
    }
  };

  // Save Add/Edit
  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error("Product name is required");
      return;
    }

    if (isAddingNew) {
      const newProd: Product = {
        id: `prod-${Date.now()}`,
        name: formName.trim(),
        price: Number(formPrice) || 0,
        leadTimeDays: Number(formLeadTime) || 3,
        isCustomizable: formCustomizable,
        sizes: formSizes.length > 0 ? formSizes : ["Standard"],
        options: formCustomizable ? formOptions : [],
        image: formImage || PRESET_IMAGES[0] || "",
      };
      setProducts([newProd, ...products]);
      toast.success("Product added to catalogue", {
        description: "The AI assistant will now quote prices for this item.",
      });
      handleCloseSlideOver();
    } else if (selectedProduct) {
      const updated: Product = {
        ...selectedProduct,
        name: formName.trim(),
        price: Number(formPrice) || 0,
        leadTimeDays: Number(formLeadTime) || 3,
        isCustomizable: formCustomizable,
        sizes: formSizes,
        options: formCustomizable ? formOptions : [],
        image: formImage || selectedProduct.image,
      };
      setProducts(products.map((p) => (p.id === selectedProduct.id ? updated : p)));
      setSelectedProduct(updated);
      setIsEditing(false);
      toast.success("Product updated successfully", {
        description: "Changes are active in the AI assistant knowledge.",
      });
    }
  };

  // Delete product
  const confirmDeleteProduct = () => {
    if (!productToDelete) return;
    setProducts(products.filter((p) => p.id !== productToDelete.id));
    if (selectedProduct?.id === productToDelete.id) {
      handleCloseSlideOver();
    }
    toast.success("Product removed from catalogue", {
      description: "The assistant has stopped quoting this product.",
    });
    setProductToDelete(null);
  };

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight">
              Catalogue
            </h1>
            <SampleDataBadge title="Catalogue items currently using static demo data" />
          </div>
          <p className="text-13 text-text-muted mt-1 max-w-xl">
            Your products. The assistant quotes prices and lead times from this list.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleStartAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-13 shadow-xs hover:brightness-105 active:scale-98 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus className="w-4 h-4" />
            <span>Add product</span>
          </button>
        </div>
      </div>

      {/* ─── Filter & Search Bar ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface shadow-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by name, sizes, options..."
            className="w-full pl-9 pr-3 py-1.5 text-13 rounded-lg bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-11 text-text-muted hover:text-text cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Customizable Only Chip */}
          <button
            type="button"
            onClick={() => setCustomizableOnly(!customizableOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-12 font-medium border transition-colors cursor-pointer ${
              customizableOnly
                ? "bg-primary-soft text-primary-text border-primary/30"
                : "bg-surface-muted text-text-muted border-border hover:text-text"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Customizable only</span>
          </button>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 text-12 text-text-muted pl-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <select
              value={sortBy}
              aria-label="Sort catalogue products"
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-surface-muted border border-border text-text text-12 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="name">Sort: Name (A-Z)</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="lead-time">Lead time (Fastest)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Product Grid ───────────────────────────────────────────────────── */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-primary-soft text-primary-text flex items-center justify-center mx-auto">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-16 font-semibold font-outfit text-text">No products yet</h3>
            <p className="text-13 text-text-muted mt-1 max-w-md mx-auto">
              No products yet — the assistant will hand every price question to you.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-13 shadow-xs hover:brightness-105 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add product</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((p) => (
            <div
              key={p.id}
              onClick={() => handleOpenDetail(p)}
              className="group relative flex flex-col rounded-xl border border-border bg-surface shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden"
            >
              {/* Photo */}
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-muted">
                <img
                  src={p.image}
                  alt={p.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60" />

                {/* Lead time badge */}
                <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-medium bg-surface/90 text-text backdrop-blur-md shadow-xs border border-border/50">
                  <Clock className="w-3 h-3 text-text-muted" />
                  <span>{p.leadTimeDays} days</span>
                </div>

                {/* Customizable badge */}
                {p.isCustomizable && (
                  <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-semibold bg-amber-500/90 text-white backdrop-blur-md shadow-xs">
                    <Sparkles className="w-3 h-3" />
                    <span>Customizable</span>
                  </div>
                )}
              </div>

              {/* Card Body */}
              <div className="flex-1 p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-16 font-semibold font-outfit text-text group-hover:text-primary-text transition-colors line-clamp-1">
                      {p.name}
                    </h2>
                    <span className="text-18 font-bold font-outfit text-text tabular-nums shrink-0">
                      ₹{p.price.toLocaleString("en-IN")}
                    </span>
                  </div>

                  {/* Sizes */}
                  {p.sizes && p.sizes.length > 0 && (
                    <p className="text-12 text-text-muted mt-1 line-clamp-1">
                      <span className="font-medium text-text">Sizes:</span> {p.sizes.join(" · ")}
                    </p>
                  )}
                </div>

                {/* Custom Options Chips */}
                {p.isCustomizable && p.options && p.options.length > 0 && (
                  <div className="pt-2 border-t border-border flex flex-wrap gap-1.5">
                    {p.options.slice(0, 3).map((opt, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-11 bg-surface-muted text-text-muted border border-border"
                      >
                        {opt}
                      </span>
                    ))}
                    {p.options.length > 3 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-11 text-text-muted">
                        +{p.options.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Product Detail & Edit SlideOver ─────────────────────────────────── */}
      <SlideOver
        open={selectedProduct !== null || isAddingNew}
        onClose={handleCloseSlideOver}
        title={
          isAddingNew
            ? "Add New Product"
            : isEditing
            ? `Edit ${selectedProduct?.name}`
            : selectedProduct?.name
        }
        subtitle={
          isAddingNew
            ? "Create a catalogue item for the AI assistant"
            : isEditing
            ? "Update pricing, lead times, and customization options"
            : `ID: ${selectedProduct?.id}`
        }
      >
        {isEditing ? (
          /* Form Mode */
          <form onSubmit={handleSaveProduct} className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="block text-13 font-semibold text-text">
                Product Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Ocean Coaster Set of 4"
                className="w-full px-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>

            {/* Price & Lead Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-13 font-semibold text-text">
                  Price (₹) <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-13 text-text-muted font-bold">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    className="w-full pl-7 pr-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-13 font-semibold text-text">
                  Lead Time (Days) <span className="text-danger">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  required
                  value={formLeadTime}
                  onChange={(e) => setFormLeadTime(Number(e.target.value))}
                  className="w-full px-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>
            </div>

            {/* Sizes (Chip input) */}
            <div className="space-y-1.5">
              <label className="block text-13 font-semibold text-text">
                Sizes & Dimensions
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sizeDraft}
                  onChange={(e) => setSizeDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSizeChip();
                    }
                  }}
                  placeholder="e.g. 10cm round, 12 inch"
                  className="flex-1 px-3 py-1.5 text-13 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={handleAddSizeChip}
                  className="px-3 py-1.5 rounded-lg bg-surface-muted border border-border text-12 font-medium hover:text-text cursor-pointer"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {formSizes.map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-12 bg-surface-muted text-text border border-border"
                  >
                    <span>{s}</span>
                    <button
                      type="button"
                      onClick={() => setFormSizes(formSizes.filter((_, idx) => idx !== i))}
                      className="text-text-muted hover:text-danger ml-0.5 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Customizable Switch */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-muted">
              <div>
                <p className="text-13 font-semibold text-text">Customizable Product</p>
                <p className="text-11 text-text-muted">
                  Can customers request custom colours, names, or embellishments?
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={formCustomizable}
                onClick={() => setFormCustomizable(!formCustomizable)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  formCustomizable ? "bg-primary" : "bg-border"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formCustomizable ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Custom Options (Chip input) */}
            {formCustomizable && (
              <div className="space-y-1.5">
                <label className="block text-13 font-semibold text-text">
                  Custom Options
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={optionDraft}
                    onChange={(e) => setOptionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddOptionChip();
                      }
                    }}
                    placeholder="e.g. colour, name, dried flowers"
                    className="flex-1 px-3 py-1.5 text-13 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button
                    type="button"
                    onClick={handleAddOptionChip}
                    className="px-3 py-1.5 rounded-lg bg-surface-muted border border-border text-12 font-medium hover:text-text cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {formOptions.map((opt, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-12 bg-primary-soft text-primary-text border border-primary/20"
                    >
                      <span>{opt}</span>
                      <button
                        type="button"
                        onClick={() => setFormOptions(formOptions.filter((_, idx) => idx !== i))}
                        className="text-primary-text/70 hover:text-danger ml-0.5 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Photo Selection */}
            <div className="space-y-2">
              <label className="block text-13 font-semibold text-text">
                Product Image
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_IMAGES.map((imgUrl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setFormImage(imgUrl)}
                    className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                      formImage === imgUrl
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-text-muted"
                    }`}
                  >
                    <img src={imgUrl} alt={`Preset ${i + 1}`} className="w-full h-full object-cover" />
                    {formImage === imgUrl && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white drop-shadow-md" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  if (isAddingNew) handleCloseSlideOver();
                  else setIsEditing(false);
                }}
                className="px-4 py-2 rounded-lg border border-border bg-surface text-text text-13 font-medium hover:bg-surface-muted cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-13 shadow-xs hover:brightness-105 transition-all cursor-pointer"
              >
                {isAddingNew ? "Create Product" : "Save Changes"}
              </button>
            </div>
          </form>
        ) : selectedProduct ? (
          /* Detail View Mode */
          <div className="space-y-6">
            {/* Large Photo */}
            <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden border border-border shadow-xs">
              <img
                src={selectedProduct.image}
                alt={selectedProduct.name}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Price & Lead Time Block */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface-muted">
              <div>
                <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">
                  Price
                </p>
                <p className="text-24 font-bold font-outfit text-text tabular-nums">
                  ₹{selectedProduct.price.toLocaleString("en-IN")}
                </p>
              </div>

              <div className="text-right">
                <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">
                  Lead Time
                </p>
                <p className="text-16 font-semibold text-text flex items-center justify-end gap-1.5 mt-1">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>{selectedProduct.leadTimeDays} days</span>
                </p>
              </div>
            </div>

            {/* Sizes */}
            <div className="space-y-2">
              <h4 className="text-13 font-semibold text-text">Available Sizes</h4>
              {selectedProduct.sizes && selectedProduct.sizes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedProduct.sizes.map((s, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-lg text-12 font-medium bg-surface-muted border border-border text-text"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-12 text-text-muted">Standard size</p>
              )}
            </div>

            {/* Customization Details */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-13 font-semibold text-text">Customization</h4>
                <span
                  className={`px-2 py-0.5 rounded-full text-11 font-semibold ${
                    selectedProduct.isCustomizable
                      ? "bg-primary-soft text-primary-text"
                      : "bg-surface-muted text-text-muted"
                  }`}
                >
                  {selectedProduct.isCustomizable ? "Customizable" : "Fixed product"}
                </span>
              </div>

              {selectedProduct.isCustomizable && selectedProduct.options.length > 0 ? (
                <div className="p-3 rounded-lg border border-border bg-surface-muted/50 space-y-2">
                  <p className="text-12 text-text-muted">Supported customization options:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProduct.options.map((opt, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-md text-12 bg-surface text-text border border-border"
                      >
                        {opt}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-12 text-text-muted">No custom options configured.</p>
              )}
            </div>

            {/* AI Assistant Note */}
            <div className="p-3.5 rounded-xl border border-primary/20 bg-primary-soft/30 text-12 text-text space-y-1">
              <p className="font-semibold text-primary-text flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Quoting Rule</span>
              </p>
              <p className="text-text-muted">
                When a customer asks for "{selectedProduct.name}", the AI automatically quotes ₹
                {selectedProduct.price.toLocaleString("en-IN")} and a {selectedProduct.leadTimeDays}
                -day dispatch timeline.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => handleStartEdit(selectedProduct)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-13 shadow-xs hover:brightness-105 cursor-pointer transition-all"
              >
                <Pencil className="w-4 h-4" />
                <span>Edit product</span>
              </button>
              <button
                type="button"
                onClick={() => setProductToDelete(selectedProduct)}
                className="inline-flex items-center justify-center p-2.5 rounded-lg border border-border text-danger hover:bg-danger/10 cursor-pointer transition-colors"
                title="Delete product"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : null}
      </SlideOver>

      {/* ─── Delete Confirmation Dialog ─────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={productToDelete !== null}
        onClose={() => setProductToDelete(null)}
        onConfirm={confirmDeleteProduct}
        title="Delete product?"
        description="The assistant will stop quoting this product."
        confirmLabel="Delete"
        tone="danger"
      />
    </div>
  );
}
