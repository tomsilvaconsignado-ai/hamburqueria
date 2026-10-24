import { getCategories, getProducts, getProductById, saveProduct, toggleProductAvailability } from './storage';
import type { Result } from './remote';
import { Category, Product } from '../types';

export const catalogService = {
  async getCategories(): Promise<Category[]> {
    return getCategories().filter((c) => c.is_active);
  },

  async getAllCategoriesAdmin(): Promise<Category[]> {
    return getCategories();
  },

  async getProducts(): Promise<Product[]> {
    return getProducts();
  },

  async getAvailableProducts(): Promise<Product[]> {
    return getProducts().filter((p) => p.is_available);
  },

  async getProductById(id: string): Promise<Product | undefined> {
    return getProductById(id);
  },

  updateProduct(product: Product): Promise<Result> {
    return saveProduct(product);
  },

  toggleAvailability(id: string): Promise<Result> {
    return toggleProductAvailability(id);
  },
};
