import { useState, useMemo, useRef, useEffect } from "react";
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
  LayoutGrid,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useUpdateProduct,
} from "../hooks/useProducts.ts";
import { uploadToCloudinary, getCloudinaryThumb } from "../api/products.ts";
import type { Product, ProductSize } from "../types/index.ts";
import { SlideOver } from "../components/shared/SlideOver.tsx";
import { ConfirmDialog } from "../components/shared/ConfirmDialog.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";

interface CatalogueProductCardProps {
  product: Product;
  onOpenDetail: (p: Product) => void;
}

function CatalogueProductCard({ product: p, onOpenDetail }: CatalogueProductCardProps) {
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const minPrice = Math.min(...(p.sizes.map((s) => s.price) || [0]));
  const maxPrice = Math.max(...(p.sizes.map((s) => s.price) || [0]));
  const priceLabel =
    p.sizes.length > 1 && minPrice !== maxPrice
      ? `₹${minPrice.toLocaleString("en-IN")} – ₹${maxPrice.toLocaleString("en-IN")}`
      : `₹${minPrice.toLocaleString("en-IN")}`;

  const hasMultipleImages = Boolean(p.images && p.images.length > 1);
  const currentPhoto = p.images?.[activePhotoIdx] || p.images?.[0];

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!p.images || p.images.length <= 1) return;
    setActivePhotoIdx((prev) => (prev - 1 + p.images.length) % p.images.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!p.images || p.images.length <= 1) return;
    setActivePhotoIdx((prev) => (prev + 1) % p.images.length);
  };

  return (
    <div
      onClick={() => onOpenDetail(p)}
      className="group relative flex flex-col rounded-xl border border-border bg-surface shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Photo Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-muted flex items-center justify-center">
        {currentPhoto ? (
          <img
            src={getCloudinaryThumb(currentPhoto, 400, 300)}
            alt={p.name}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-text-muted/60"
            aria-label="No photo"
          >
            <Package className="w-7 h-7 sm:w-8 sm:h-8" strokeWidth={1.5} />
          </div>
        )}

        {/* Carousel Navigation Arrows */}
        {hasMultipleImages && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-surface/90 backdrop-blur-md shadow-xs flex items-center justify-center text-text hover:bg-surface border border-border/60 transition-opacity opacity-0 group-hover:opacity-100 max-sm:opacity-90 cursor-pointer"
              title="Previous photo"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-surface/90 backdrop-blur-md shadow-xs flex items-center justify-center text-text hover:bg-surface border border-border/60 transition-opacity opacity-0 group-hover:opacity-100 max-sm:opacity-90 cursor-pointer"
              title="Next photo"
              aria-label="Next photo"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Pagination Dots */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-md">
              {p.images.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePhotoIdx(idx);
                  }}
                  className={`rounded-full transition-all cursor-pointer ${
                    idx === activePhotoIdx ? "w-3 h-1 bg-white" : "w-1 h-1 bg-white/60 hover:bg-white"
                  }`}
                  aria-label={`Photo ${idx + 1}`}
                />
              ))}
            </div>
          </>
        )}

        {/* Lead time micro-badge */}
        <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 z-10 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium bg-surface/90 text-text backdrop-blur-md shadow-xs border border-border/50">
          <Clock className="w-2.5 h-2.5 text-text-muted" />
          <span>{p.leadTimeDays}d</span>
        </div>

        {/* Customizable micro-badge */}
        {p.customizable && (
          <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold bg-[#38C7D8] text-white backdrop-blur-md shadow-xs">
            <Sparkles className="w-2.5 h-2.5" />
            <span>Custom</span>
          </div>
        )}

        {/* Multiple photos count chip */}
        {hasMultipleImages && (
          <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 z-10 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-medium bg-black/60 text-white backdrop-blur-md">
            <ImageIcon className="w-2.5 h-2.5" />
            <span>
              {activePhotoIdx + 1}/{p.images.length}
            </span>
          </div>
        )}
      </div>

      {/* Compact Card Body */}
      <div className="flex-1 p-2 sm:p-2.5 flex flex-col justify-between gap-1 sm:gap-1.5">
        <div>
          <div className="flex items-start justify-between gap-1">
            <h2 className="text-[12px] sm:text-[13px] font-semibold font-outfit text-text group-hover:text-primary-text transition-colors truncate">
              {p.name}
            </h2>
          </div>
          <div className="text-[12px] sm:text-[13px] font-bold font-outfit text-text tabular-nums mt-0.5">
            {priceLabel}
          </div>

          {/* Sizes */}
          {p.sizes && p.sizes.length > 0 && (
            <p className="text-[10px] sm:text-[11px] text-text-muted truncate mt-0.5">
              {p.sizes.map((s) => s.name).join(" · ")}
            </p>
          )}
        </div>

        {/* Custom Options indicator */}
        {p.customizable && p.customOptions && p.customOptions.length > 0 && (
          <div className="pt-1 border-t border-border/60 text-[9px] sm:text-[10px] text-text-muted truncate">
            {p.customOptions.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Catalogue() {
  const { data, isLoading, isError, refetch } = useProducts({ active: "true" });
  const products = useMemo(() => data?.products ?? [], [data?.products]);

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  const [searchQuery, setSearchQuery] = useState("");
  const [customizableOnly, setCustomizableOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "price-asc" | "price-desc" | "lead-time">("name");

  // Selection & SlideOver state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailPhotoIdx, setDetailPhotoIdx] = useState(0);
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

  // Reset to page 1 whenever filters or search change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, customizableOnly, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, page]);

  // Open product detail
  const handleOpenDetail = (p: Product) => {
    setSelectedProduct(p);
    setDetailPhotoIdx(0);
    setIsEditing(false);
    setIsAddingNew(false);
  };

  // Switch to edit mode
  const handleStartEdit = (p: Product) => {
    setSelectedProduct(p);
    setDetailPhotoIdx(0);
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
    setDetailPhotoIdx(0);
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
    setDetailPhotoIdx(0);
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
    const toastId = toast.loading("Uploading image...");

    try {
      const secureUrl = await uploadToCloudinary(file);
      setFormImages((prev) => [...prev, secureUrl].slice(0, 5));
      toast.success("Image uploaded successfully", { id: toastId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Photo upload failed. Please try again.";
      toast.error(msg, { id: toastId });
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
      images: formImages,
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
    <div className="space-y-3.5 sm:space-y-4 lg:space-y-4 pb-6 sm:pb-8 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-22 sm:text-24 lg:text-26 font-bold font-outfit text-text tracking-tight">
            Catalogue
          </h1>
          <p className="text-12 sm:text-13 text-text-muted mt-0.5 sm:mt-1 max-w-xl">
            Your products. The assistant quotes prices and lead times directly from this live catalogue.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* View Toggle */}
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "grid"
                  ? "bg-surface-muted text-text font-bold"
                  : "text-text-muted hover:text-text"
              }`}
              title="Grid view (6 per row on desktop)"
              aria-label="Switch to grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "table"
                  ? "bg-surface-muted text-text font-bold"
                  : "text-text-muted hover:text-text"
              }`}
              title="Table view"
              aria-label="Switch to table view"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleStartAdd}
            className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-13 shadow-xs hover:brightness-105 active:scale-98 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus className="w-4 h-4" />
            <span>Add product</span>
          </button>
        </div>
      </div>

      {/* ─── Filter & Search Bar ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl border border-border bg-surface shadow-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
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

        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-2.5 lg:gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs animate-pulse"
            >
              <div className="aspect-[4/3] bg-surface-muted w-full" />
              <div className="p-2 sm:p-2.5 space-y-1.5">
                <div className="h-3.5 w-3/5 bg-surface-muted rounded-md" />
                <div className="h-3 w-4/5 bg-surface-muted rounded-md" />
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
        <div className="rounded-xl border border-border bg-surface p-6 sm:p-10">
          <EmptyState
            title={searchQuery || customizableOnly ? "No products match" : "No products yet"}
            description={
              searchQuery || customizableOnly
                ? "Try adjusting your search terms or filters to find what you're looking for."
                : "No products yet — the assistant will hand every price question to you."
            }
            action={
              searchQuery || customizableOnly
                ? {
                    label: "Clear filters",
                    onClick: () => {
                      setSearchQuery("");
                      setCustomizableOnly(false);
                    },
                    variant: "outline",
                  }
                : {
                    label: "Add product",
                    onClick: handleStartAdd,
                  }
            }
          />
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            /* ─── 6-Column Responsive Product Grid (Fits single screen on desktop) ─── */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-2.5 lg:gap-3">
              {paginatedProducts.map((p) => (
                <CatalogueProductCard
                  key={p.id}
                  product={p}
                  onOpenDetail={handleOpenDetail}
                />
              ))}
            </div>
          ) : (
            /* ─── Table View (Orders Pattern) ────────────────────────── */
            <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-13 border-collapse">
                  <thead className="bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted">
                    <tr>
                      <th className="p-3 w-14">Photo</th>
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Price</th>
                      <th className="p-3">Sizes</th>
                      <th className="p-3">Lead Time</th>
                      <th className="p-3">Customizable</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {paginatedProducts.map((p) => {
                      const minPrice = Math.min(...(p.sizes.map((s) => s.price) || [0]));
                      const maxPrice = Math.max(...(p.sizes.map((s) => s.price) || [0]));
                      const priceLabel =
                        p.sizes.length > 1 && minPrice !== maxPrice
                          ? `₹${minPrice.toLocaleString("en-IN")} – ₹${maxPrice.toLocaleString("en-IN")}`
                          : `₹${minPrice.toLocaleString("en-IN")}`;
                      const mainPhoto = p.images?.[0];

                      return (
                        <tr
                          key={p.id}
                          onClick={() => handleOpenDetail(p)}
                          className="hover:bg-surface-muted transition-colors cursor-pointer group"
                        >
                          <td className="p-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-muted border border-border/50 shrink-0">
                              {mainPhoto ? (
                                <img
                                  src={getCloudinaryThumb(mainPhoto, 80, 80)}
                                  alt={p.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-text-muted">
                                  <Package className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-text group-hover:text-primary-text transition-colors">
                              {p.name}
                            </div>
                            {p.description && (
                              <div className="text-11 text-text-muted line-clamp-1 max-w-xs">
                                {p.description}
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-bold font-outfit text-text tabular-nums whitespace-nowrap">
                            {priceLabel}
                          </td>
                          <td className="p-3 text-text-muted text-12 max-w-xs truncate">
                            {p.sizes?.map((s) => s.name).join(" · ") || "—"}
                          </td>
                          <td className="p-3 whitespace-nowrap text-12">
                            <span className="inline-flex items-center gap-1 text-text-muted">
                              <Clock className="w-3.5 h-3.5" />
                              {p.leadTimeDays} days
                            </span>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            {p.customizable ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-11 font-semibold bg-[#38C7D8]/10 text-[#0E7D8D] dark:text-[#67E8F9] border border-[#38C7D8]/20">
                                <Sparkles className="w-3 h-3" />
                                Yes
                              </span>
                            ) : (
                              <span className="text-12 text-text-muted">No</span>
                            )}
                          </td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(p)}
                                className="p-1.5 rounded-md hover:bg-surface-muted text-text-muted hover:text-text cursor-pointer transition"
                                title="Edit product"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setProductToDelete(p)}
                                className="p-1.5 rounded-md hover:bg-rose-500/10 text-text-muted hover:text-rose-600 cursor-pointer transition"
                                title="Delete product"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Pagination Bar ─────────────────────────────────────────────── */}
          {filteredProducts.length > 0 && (
            <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl border border-border bg-surface text-xs text-text-muted shadow-xs mt-3 sm:mt-4">
              <span>
                Showing{" "}
                <span className="font-semibold text-text">
                  {Math.min((page - 1) * ITEMS_PER_PAGE + 1, filteredProducts.length)}–
                  {Math.min(page * ITEMS_PER_PAGE, filteredProducts.length)}
                </span>{" "}
                of <span className="font-semibold text-text">{filteredProducts.length}</span> products
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-surface-muted text-text hover:bg-surface text-xs font-semibold cursor-pointer disabled:opacity-40 transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                <span className="px-2 font-medium text-text">
                  Page {page} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-surface-muted text-text hover:bg-surface text-xs font-semibold cursor-pointer disabled:opacity-40 transition"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
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
                  <p className="text-12 text-text-muted">No photos uploaded yet.</p>
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
              <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden border border-border shadow-xs bg-surface-muted flex items-center justify-center">
                {selectedProduct.images && selectedProduct.images.length > 0 ? (
                  <>
                    <img
                      src={selectedProduct.images[detailPhotoIdx] || selectedProduct.images[0]}
                      alt={selectedProduct.name}
                      className="w-full h-full object-contain bg-surface-muted/60"
                    />
                    {selectedProduct.images.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setDetailPhotoIdx(
                              (prev) =>
                                (prev - 1 + selectedProduct.images.length) %
                                selectedProduct.images.length
                            )
                          }
                          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-surface/85 backdrop-blur-md shadow-xs flex items-center justify-center text-text hover:bg-surface border border-border/60 transition cursor-pointer"
                          aria-label="Previous photo"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDetailPhotoIdx(
                              (prev) => (prev + 1) % selectedProduct.images.length
                            )
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-surface/85 backdrop-blur-md shadow-xs flex items-center justify-center text-text hover:bg-surface border border-border/60 transition cursor-pointer"
                          aria-label="Next photo"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-11 font-medium bg-black/60 text-white backdrop-blur-md">
                          {detailPhotoIdx + 1} / {selectedProduct.images.length}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted/60" aria-label="No photo">
                    <Package className="w-12 h-12" strokeWidth={1.5} />
                  </div>
                )}
              </div>
              {selectedProduct.images && selectedProduct.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {selectedProduct.images.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDetailPhotoIdx(i)}
                      className={`relative w-16 h-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                        i === detailPhotoIdx
                          ? "border-primary ring-2 ring-primary/20 scale-102"
                          : "border-border/60 opacity-70 hover:opacity-100"
                      }`}
                      title={`View photo ${i + 1}`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
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
                  <Sparkles className="w-4 h-4 text-[#38C7D8]" />
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
