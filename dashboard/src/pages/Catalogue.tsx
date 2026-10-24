import { useState, useMemo, useRef } from "react";
import {
  Plus,
  Search,
  SlidersHorizontal,
  Clock,
  Sparkles,
  Package,
  Pencil,
  Trash2,
  Upload,
  X,
  ImageIcon,
  Loader2,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useUpdateProduct,
} from "../hooks/useProducts.ts";
import { uploadToCloudinary } from "../api/products.ts";
import type { Product, ProductSize } from "../types/index.ts";
import { SlideOver } from "../components/shared/SlideOver.tsx";
import { ConfirmDialog } from "../components/shared/ConfirmDialog.tsx";

const FALLBACK_PRESET_IMAGES = [
  "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1615529182904-14819c35db37?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&auto=format&fit=crop&q=80",
];

export default function Catalogue() {
  const { data, isLoading, isError, refetch } = useProducts({ active: "true" });
  const products = useMemo(() => data?.products ?? [], [data?.products]);

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

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
  const [formDescription, setFormDescription] = useState("");
  const [formLeadTime, setFormLeadTime] = useState<number>(3);
  const [formCustomizable, setFormCustomizable] = useState(false);
  const [formSizes, setFormSizes] = useState<ProductSize[]>([
    { name: "Standard", price: 1200 },
  ]);
  const [formOptions, setFormOptions] = useState<string[]>([]);
  const [formImages, setFormImages] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Input draft states for chip inputs
  const [optionDraft, setOptionDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter & sort products
  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      if (customizableOnly && !p.customizable) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchDesc = p.description?.toLowerCase().includes(q);
        const matchSizes = p.sizes?.some((s) => s.name.toLowerCase().includes(q));
        const matchOptions = p.customOptions?.some((o) => o.toLowerCase().includes(q));
        return matchName || matchDesc || matchSizes || matchOptions;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      const aMinPrice = Math.min(...(a.sizes.map((s) => s.price) || [0]));
      const bMinPrice = Math.min(...(b.sizes.map((s) => s.price) || [0]));

      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "price-asc") return aMinPrice - bMinPrice;
      if (sortBy === "price-desc") return bMinPrice - aMinPrice;
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
    setFormDescription(p.description || "");
    setFormLeadTime(p.leadTimeDays);
    setFormCustomizable(p.customizable);
    setFormSizes(
      p.sizes && p.sizes.length > 0 ? p.sizes : [{ name: "Standard", price: 1200 }],
    );
    setFormOptions(p.customOptions || []);
    setFormImages(p.images || []);
    setIsEditing(true);
    setIsAddingNew(false);
  };

  // Open add modal
  const handleStartAdd = () => {
    setSelectedProduct(null);
    setFormName("");
    setFormDescription("");
    setFormLeadTime(3);
    setFormCustomizable(false);
    setFormSizes([{ name: "Standard", price: 1200 }]);
    setFormOptions(["Colour", "Name engraving"]);
    setFormImages([]);
    setIsAddingNew(true);
    setIsEditing(true);
  };

  // Close SlideOver
  const handleCloseSlideOver = () => {
    setSelectedProduct(null);
    setIsEditing(false);
    setIsAddingNew(false);
    setOptionDraft("");
    setIsUploadingImage(false);
  };

  // Size row management
  const handleAddSizeRow = () => {
    setFormSizes([...formSizes, { name: "", price: 500 }]);
  };

  const handleUpdateSizeRow = (index: number, field: "name" | "price", val: string | number) => {
    const updated = [...formSizes];
    const current = updated[index];
    if (!current) return;
    if (field === "name") {
      updated[index] = { ...current, name: String(val) };
    } else {
      updated[index] = { ...current, price: Math.max(1, Math.round(Number(val) || 0)) };
    }
    setFormSizes(updated);
  };

  const handleRemoveSizeRow = (index: number) => {
    if (formSizes.length <= 1) {
      toast.error("Products must have at least 1 size");
      return;
    }
    setFormSizes(formSizes.filter((_, i) => i !== index));
  };

  // Custom options chip management
  const handleAddOptionChip = () => {
    const trimmed = optionDraft.trim();
    if (trimmed && !formOptions.includes(trimmed)) {
      setFormOptions([...formOptions, trimmed]);
      setOptionDraft("");
    }
  };

  // Image upload handling
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (formImages.length >= 5) {
      toast.error("Maximum 5 photos allowed per product");
      return;
    }

    const file = files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image file size must be under 10MB");
      return;
    }

    setIsUploadingImage(true);
    const toastId = toast.loading("Uploading photo to Cloudinary...");

    try {
      const secureUrl = await uploadToCloudinary(file);
      setFormImages((prev) => [...prev, secureUrl].slice(0, 5));
      toast.success("Photo uploaded successfully", { id: toastId });
    } catch (err) {
      console.error("Cloudinary upload failed:", err);
      toast.error("Photo upload failed. Please try again.", { id: toastId });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = (index: number) => {
    setFormImages(formImages.filter((_, i) => i !== index));
  };

  const handleSetMainImage = (index: number) => {
    if (index === 0) return;
    const item = formImages[index];
    if (!item) return;
    const rest = formImages.filter((_, i) => i !== index);
    setFormImages([item, ...rest]);
    toast.success("Set as main photo");
  };

  const handleUseFallbackPreset = (presetUrl: string) => {
    if (formImages.includes(presetUrl)) return;
    if (formImages.length >= 5) {
      toast.error("Maximum 5 photos allowed per product");
      return;
    }
    setFormImages([...formImages, presetUrl]);
  };

  // Save Add/Edit
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error("Product name is required");
      return;
    }

    // Validate sizes
    if (formSizes.length === 0) {
      toast.error("At least 1 size is required");
      return;
    }

    const invalidSize = formSizes.find((s) => !s.name.trim() || s.price <= 0);
    if (invalidSize) {
      toast.error("Every size must have a name and a whole rupee price greater than 0");
      return;
    }

    const payload = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      sizes: formSizes.map((s) => ({ name: s.name.trim(), price: Math.round(s.price) })),
      leadTimeDays: Math.max(0, Math.round(Number(formLeadTime) || 3)),
      customizable: formCustomizable,
      customOptions: formCustomizable ? formOptions : [],
      images: formImages.length > 0 ? formImages : [FALLBACK_PRESET_IMAGES[0] || ""],
      isActive: true,
    };

    if (isAddingNew) {
      try {
        await createMutation.mutateAsync(payload);
        toast.success("Product created", {
          description: "The AI assistant will now quote prices for this item.",
        });
        handleCloseSlideOver();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to create product";
        toast.error(message);
      }
    } else if (selectedProduct) {
      try {
        const res = await updateMutation.mutateAsync({
          id: selectedProduct.id,
          data: payload,
        });
        setSelectedProduct(res.product);
        setIsEditing(false);
        toast.success("Product updated", {
          description: "Changes are active in the AI assistant knowledge.",
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to update product";
        toast.error(message);
      }
    }
  };

  // Delete product
  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      await deleteMutation.mutateAsync(productToDelete.id);
      if (selectedProduct?.id === productToDelete.id) {
        handleCloseSlideOver();
      }
      toast.success("Product removed from catalogue", {
        description: "The assistant has stopped quoting this product.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete product";
      toast.error(message);
    } finally {
      setProductToDelete(null);
    }
  };

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight">
            Catalogue
          </h1>
          <p className="text-13 text-text-muted mt-1 max-w-xl">
            Your products. The assistant quotes prices and lead times directly from this live catalogue.
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
              onChange={(e) => setSortBy(e.target.value as "name" | "price-asc" | "price-desc" | "lead-time")}
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

      {/* ─── Loading Skeletons ──────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs animate-pulse"
            >
              <div className="aspect-[4/3] bg-surface-muted w-full" />
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-5 w-3/5 bg-surface-muted rounded-md" />
                  <div className="h-5 w-1/4 bg-surface-muted rounded-md" />
                </div>
                <div className="h-4 w-4/5 bg-surface-muted rounded-md" />
                <div className="h-4 w-2/5 bg-surface-muted rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
            <X className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-16 font-semibold font-outfit text-text">Failed to load catalogue</h3>
            <p className="text-13 text-text-muted mt-1 max-w-md mx-auto">
              There was an issue fetching the products catalogue.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-surface-muted border border-border text-text font-semibold text-13 hover:bg-surface cursor-pointer"
          >
            Try Again
          </button>
        </div>
      ) : filteredProducts.length === 0 ? (
        /* Empty state */
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
        /* ─── Product Grid ───────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((p) => {
            const minPrice = Math.min(...(p.sizes.map((s) => s.price) || [0]));
            const maxPrice = Math.max(...(p.sizes.map((s) => s.price) || [0]));
            const priceLabel =
              p.sizes.length > 1 && minPrice !== maxPrice
                ? `₹${minPrice.toLocaleString("en-IN")} – ₹${maxPrice.toLocaleString("en-IN")}`
                : `₹${minPrice.toLocaleString("en-IN")}`;
            const mainPhoto = p.images && p.images.length > 0 ? p.images[0] : FALLBACK_PRESET_IMAGES[0];

            return (
              <div
                key={p.id}
                onClick={() => handleOpenDetail(p)}
                className="group relative flex flex-col rounded-xl border border-border bg-surface shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden"
              >
                {/* Photo */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-muted">
                  <img
                    src={mainPhoto}
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
                  {p.customizable && (
                    <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-semibold bg-amber-500/90 text-white backdrop-blur-md shadow-xs">
                      <Sparkles className="w-3 h-3" />
                      <span>Customizable</span>
                    </div>
                  )}

                  {/* Multiple photos count chip */}
                  {p.images && p.images.length > 1 && (
                    <div className="absolute bottom-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-11 font-medium bg-black/60 text-white backdrop-blur-md">
                      <ImageIcon className="w-3 h-3" />
                      <span>{p.images.length} photos</span>
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
                      <span className="text-16 font-bold font-outfit text-text tabular-nums shrink-0">
                        {priceLabel}
                      </span>
                    </div>

                    {/* Sizes */}
                    {p.sizes && p.sizes.length > 0 && (
                      <p className="text-12 text-text-muted mt-1 line-clamp-1">
                        <span className="font-medium text-text">Sizes:</span>{" "}
                        {p.sizes.map((s) => s.name).join(" · ")}
                      </p>
                    )}
                  </div>

                  {/* Custom Options Chips */}
                  {p.customizable && p.customOptions && p.customOptions.length > 0 && (
                    <div className="pt-2 border-t border-border flex flex-wrap gap-1.5">
                      {p.customOptions.slice(0, 3).map((opt, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-11 bg-surface-muted text-text-muted border border-border"
                        >
                          {opt}
                        </span>
                      ))}
                      {p.customOptions.length > 3 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-11 text-text-muted">
                          +{p.customOptions.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
            ? "Update pricing, sizes, and photos"
            : `Slug: ${selectedProduct?.slug}`
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

            {/* Description */}
            <div className="space-y-1.5">
              <label className="block text-13 font-semibold text-text">
                Description (optional)
              </label>
              <textarea
                rows={2}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Key details, materials or instructions for the AI"
                className="w-full px-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>

            {/* Sizes & Prices Table (At least 1 size, each size has its own price) */}
            <div className="space-y-2 p-3.5 rounded-xl border border-border bg-surface-muted/40">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-13 font-semibold text-text">
                    Sizes & Prices <span className="text-danger">*</span>
                  </label>
                  <p className="text-11 text-text-muted">
                    Each size has its own whole-rupee price. The AI quotes the exact price for requested sizes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddSizeRow}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-12 font-medium rounded-md bg-surface text-text border border-border hover:bg-surface-muted cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add size</span>
                </button>
              </div>

              <div className="space-y-2 pt-1">
                {formSizes.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Size name (e.g. 10cm round or Standard)"
                      value={s.name}
                      onChange={(e) => handleUpdateSizeRow(idx, "name", e.target.value)}
                      className="flex-1 px-3 py-1.5 text-13 rounded-lg bg-surface border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <div className="relative w-32 shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-12 text-text-muted font-bold">
                        ₹
                      </span>
                      <input
                        type="number"
                        min="1"
                        required
                        placeholder="Price"
                        value={s.price || ""}
                        onChange={(e) => handleUpdateSizeRow(idx, "price", e.target.value)}
                        className="w-full pl-6 pr-2 py-1.5 text-13 rounded-lg bg-surface border border-border text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    {formSizes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSizeRow(idx)}
                        className="p-1.5 text-text-muted hover:text-danger rounded-md hover:bg-surface cursor-pointer"
                        title="Remove size"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Lead Time */}
            <div className="space-y-1.5">
              <label className="block text-13 font-semibold text-text">
                Lead Time (Days) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="60"
                required
                value={formLeadTime}
                onChange={(e) => setFormLeadTime(Number(e.target.value))}
                className="w-full px-3 py-2 text-13 rounded-lg bg-surface-muted border border-border text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
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

            {/* Photo Upload to Cloudinary */}
            <div className="space-y-3 p-3.5 rounded-xl border border-border bg-surface-muted/40">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-13 font-semibold text-text">
                    Product Photos (Max 5)
                  </label>
                  <p className="text-11 text-text-muted">
                    First photo is the main photo. Uploaded directly to Cloudinary.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isUploadingImage || formImages.length >= 5}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-12 shadow-xs hover:brightness-105 disabled:opacity-50 cursor-pointer transition-all"
                >
                  {isUploadingImage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>Upload photo</span>
                </button>
              </div>

              {/* Uploaded Photos Grid */}
              {formImages.length > 0 ? (
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  {formImages.map((imgUrl, i) => (
                    <div
                      key={i}
                      className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-border bg-surface"
                    >
                      <img src={imgUrl} alt={`Product ${i + 1}`} className="w-full h-full object-cover" />
                      {/* Main photo badge */}
                      {i === 0 && (
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-10 font-bold bg-primary text-primary-foreground shadow-xs">
                          Main
                        </div>
                      )}
                      {/* Controls on hover */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                        {i !== 0 && (
                          <button
                            type="button"
                            onClick={() => handleSetMainImage(i)}
                            className="p-1 rounded bg-surface/90 text-text hover:text-primary cursor-pointer"
                            title="Make main photo"
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(i)}
                          className="p-1 rounded bg-surface/90 text-danger hover:bg-danger hover:text-white cursor-pointer"
                          title="Remove photo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 border-2 border-dashed border-border rounded-lg text-center space-y-2">
                  <div className="w-8 h-8 rounded-full bg-surface-muted text-text-muted flex items-center justify-center mx-auto">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <p className="text-12 text-text-muted">
                    No photos uploaded yet. Or select a sample photo below:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    {FALLBACK_PRESET_IMAGES.slice(0, 4).map((pImg, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleUseFallbackPreset(pImg)}
                        className="w-12 h-10 rounded overflow-hidden border border-border hover:border-primary cursor-pointer"
                      >
                        <img src={pImg} alt="sample" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                disabled={createMutation.isPending || updateMutation.isPending}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-13 shadow-xs hover:brightness-105 disabled:opacity-50 transition-all cursor-pointer"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <span>{isAddingNew ? "Create Product" : "Save Changes"}</span>
              </button>
            </div>
          </form>
        ) : selectedProduct ? (
          /* Detail View Mode */
          <div className="space-y-6">
            {/* Photos Carousel / Main Photo */}
            <div className="space-y-2">
              <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden border border-border shadow-xs bg-surface-muted">
                <img
                  src={
                    selectedProduct.images && selectedProduct.images.length > 0
                      ? selectedProduct.images[0]
                      : FALLBACK_PRESET_IMAGES[0]
                  }
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover"
                />
              </div>
              {selectedProduct.images && selectedProduct.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {selectedProduct.images.map((img, i) => (
                    <div
                      key={i}
                      className="relative w-16 h-12 rounded-md overflow-hidden border border-border shrink-0"
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            {selectedProduct.description && (
              <p className="text-13 text-text-muted leading-relaxed">
                {selectedProduct.description}
              </p>
            )}

            {/* Sizes & Pricing Table */}
            <div className="space-y-2 p-3.5 rounded-xl border border-border bg-surface-muted/50">
              <h4 className="text-13 font-semibold text-text">Sizes & Pricing</h4>
              <div className="divide-y divide-border/60">
                {selectedProduct.sizes?.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 text-13">
                    <span className="font-medium text-text">{s.name}</span>
                    <span className="font-bold font-outfit text-primary-text tabular-nums">
                      ₹{s.price.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Lead Time & Customization Block */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-border bg-surface-muted">
                <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">
                  Lead Time
                </p>
                <p className="text-15 font-semibold text-text flex items-center gap-1.5 mt-1">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>{selectedProduct.leadTimeDays} days</span>
                </p>
              </div>

              <div className="p-3 rounded-xl border border-border bg-surface-muted">
                <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">
                  Customizable
                </p>
                <p className="text-15 font-semibold text-text flex items-center gap-1.5 mt-1">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>{selectedProduct.customizable ? "Yes" : "Fixed"}</span>
                </p>
              </div>
            </div>

            {/* Customization Details */}
            {selectedProduct.customizable && (
              <div className="space-y-2">
                <h4 className="text-13 font-semibold text-text">Custom Options</h4>
                {selectedProduct.customOptions && selectedProduct.customOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProduct.customOptions.map((opt, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-md text-12 bg-primary-soft text-primary-text border border-primary/20"
                      >
                        {opt}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-12 text-text-muted">Standard customization permitted.</p>
                )}
              </div>
            )}

            {/* AI Assistant Note */}
            <div className="p-3.5 rounded-xl border border-primary/20 bg-primary-soft/30 text-12 text-text space-y-1">
              <p className="font-semibold text-primary-text flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Quoting Rule</span>
              </p>
              <p className="text-text-muted">
                When a customer asks without naming a size, the AI lists every size with its price.
                When they specify a size, it quotes only that one.
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
