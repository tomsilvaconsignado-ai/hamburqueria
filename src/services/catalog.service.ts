import { getCategories, getProducts, getProductById, saveProduct, toggleProductAvailability } from './storage';
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

  async updateProduct(product: Product): Promise<void> {
    saveProduct(product);
  },

  async toggleAvailability(id: string): Promise<void> {
    toggleProductAvailability(id);
  },
};
