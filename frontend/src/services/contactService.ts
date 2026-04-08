/**
 * Contact Service
 * Handles all contact-related CRUD operations via API
 */

import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface Contact {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  type: string;
  status: string;
  linkedLeadId?: string;
  company?: string;
  position?: string;
  notes?: string;
  moduleType?: string;
  linkedPropertyIds?: string[];
  linkedDealIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactRequest {
  name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  type: string;
  status?: string;
  linkedLeadId?: string;
  company?: string;
  position?: string;
  notes?: string;
  moduleType?: string;
  linkedPropertyIds?: string[];
  linkedDealIds?: string[];
}

class ContactService {
  /**
   * Get all contacts with optional filtering
   */
  async getAllContacts(filters?: { page?: number; limit?: number; type?: string; status?: string; moduleType?: string }): Promise<{
    data: Contact[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.type) params.append('type', filters.type);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.moduleType) params.append('moduleType', filters.moduleType);

      const response = await apiClient.get<{
        success: boolean;
        data: { data: Contact[]; pagination: any };
      }>('/contacts', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch contacts');
    }
  }

  /**
   * Get a single contact by ID
   */
  async getContactById(id: string): Promise<Contact> {
    try {
      const response = await apiClient.get<{ success: boolean; data: Contact }>(
        `/contacts/${id}`
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch contact');
    }
  }

  /**
   * Create a new contact
   */
  async createContact(data: CreateContactRequest): Promise<Contact> {
    try {
      const response = await apiClient.post<{ success: boolean; data: Contact }>(
        '/contacts',
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create contact');
    }
  }

  /**
   * Update an existing contact
   */
  async updateContact(id: string, data: Partial<CreateContactRequest>): Promise<Contact> {
    try {
      const response = await apiClient.put<{ success: boolean; data: Contact }>(
        `/contacts/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update contact');
    }
  }

  /**
   * Delete a contact
   */
  async deleteContact(id: string): Promise<void> {
    try {
      await apiClient.delete(`/contacts/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete contact');
    }
  }
}

export const contactService = new ContactService();
export default contactService;
