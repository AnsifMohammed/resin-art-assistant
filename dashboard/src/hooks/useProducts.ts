import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProduct,
  deleteProduct,
  getProducts,
  type ProductsQuery,
  updateProduct,
} from "../api/products.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { CreateProductRequest, UpdateProductRequest } from "../types/index.ts";

/** GET /products */
export function useProducts(query?: ProductsQuery) {
  return useQuery({
    queryKey: queryKeys.products.list(query?.active),
    queryFn: ({ signal }) => getProducts(query, signal),
  });
}

/** POST /products */
export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProductRequest) => createProduct(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.products.all });
      qc.invalidateQueries({ queryKey: queryKeys.knowledgeBase.all });
    },
  });
}

/** PUT /products/:id */
export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductRequest }) =>
      updateProduct(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.products.all });
      qc.invalidateQueries({ queryKey: queryKeys.knowledgeBase.all });
    },
  });
}

/** DELETE /products/:id */
export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.products.all });
      qc.invalidateQueries({ queryKey: queryKeys.knowledgeBase.all });
    },
  });
}
