/**
 * Lightstone API Service Layer
 * 
 * Handles all interactions with Lightstone APIs including:
 * - Static map image fetching
 * - Suburb/street address lookup
 * - Error handling and retry logic
 * - API authentication and request formatting
 * 
 * @author CRM Development Team
 * @version 1.0.0
 */

interface LightstoneConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
}

interface StaticMapParams {
  id: string;
  zoom: number;
  lat: number;
  lon: number;
  width: number;
  height: number;
}

interface AddressData {
  addressId: string;
  fullAddress: string;
  streetName: string;
  streetNumber?: string;
  suburbName: string;
  province: string;
  postalCode?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

interface SuburbAddressResponse {
  success: boolean;
  data: AddressData[];
  totalCount: number;
  pageSize: number;
  pageNumber: number;
}

interface ApiError {
  code: string;
  message: string;
  status: number;
  originalError?: Error;
}

class LightstoneService {
  private config: LightstoneConfig;
  private requestCache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes cache

  constructor(config: Partial<LightstoneConfig> = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.NEXT_PUBLIC_LIGHTSTONE_API_KEY || '',
      baseUrl: config.baseUrl || process.env.NEXT_PUBLIC_LIGHTSTONE_BASE_URL || 'https://apis.lightstone.co.za',
      timeout: config.timeout || 10000,
      retryAttempts: config.retryAttempts || 3,
    };

    if (!this.config.apiKey) {
      console.warn('LightstoneService: API key not found in environment variables');
    }
  }

  /**
   * Fetches a static map image from Lightstone
   * 
   * @param params - Static map parameters (id, zoom, lat, lon, width, height)
   * @returns Promise with static map image URL
   * @throws ApiError if request fails after retries
   */
  async getStaticMapImage(params: StaticMapParams): Promise<string> {
    const cacheKey = `staticMap_${JSON.stringify(params)}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    const url = `${this.config.baseUrl}/maps/v1/static/${params.id}/${params.zoom}/${params.lat},${params.lon}/${params.width}x${params.height}`;

    try {
      const response = await this.makeRequest(url, 'GET');
      
      // Lightstone returns image URL or image data
      const imageUrl = typeof response === 'string' ? response : response.imageUrl;
      
      this.setInCache(cacheKey, imageUrl);
      return imageUrl;
    } catch (error) {
      throw this.handleError(error, 'Failed to fetch static map image');
    }
  }

  /**
   * Fetches all addresses within a suburb/street from Lightstone
   * 
   * @param suburbId - Lightstone suburb identifier
   * @param options - Optional pagination and filtering
   * @returns Promise with array of AddressData objects
   * @throws ApiError if request fails after retries
   */
  async getSuburbStreetAddresses(
    suburbId: string,
    options: { pageSize?: number; pageNumber?: number; searchTerm?: string } = {}
  ): Promise<SuburbAddressResponse> {
    if (!suburbId || suburbId.trim() === '') {
      throw {
        code: 'INVALID_SUBURB_ID',
        message: 'Suburb ID is required and cannot be empty',
        status: 400,
      } as ApiError;
    }

    const cacheKey = `addresses_${suburbId}_${JSON.stringify(options)}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    const url = new URL(`${this.config.baseUrl}/lspdata/v1/suburbstreet/${suburbId}/addressinstreet`);
    
    // Add query parameters
    if (options.pageSize) url.searchParams.append('pageSize', options.pageSize.toString());
    if (options.pageNumber) url.searchParams.append('pageNumber', options.pageNumber.toString());
    if (options.searchTerm) url.searchParams.append('search', options.searchTerm);

    try {
      const response = await this.makeRequest(url.toString(), 'GET');
      
      // Validate and normalize response
      const normalizedResponse = this.normalizeAddressResponse(response);
      
      this.setInCache(cacheKey, normalizedResponse);
      return normalizedResponse;
    } catch (error) {
      throw this.handleError(error, `Failed to fetch addresses for suburb: ${suburbId}`);
    }
  }

  /**
   * Makes an HTTP request with retry logic and timeout handling
   * 
   * @private
   * @param url - The URL to request
   * @param method - HTTP method (GET, POST, etc.)
   * @param body - Optional request body
   * @returns Promise with parsed response
   */
  private async makeRequest(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          method,
          headers: this.getRequestHeaders(),
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw {
            status: response.status,
            statusText: response.statusText,
            message: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        const contentType = response.headers.get('content-type');
        
        // Handle image responses
        if (contentType?.includes('image')) {
          return response.url || url;
        }

        // Handle JSON responses
        if (contentType?.includes('application/json')) {
          return await response.json();
        }

        // Handle text responses
        return await response.text();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx) except 429 (too many requests)
        if (error instanceof Error && error.message.includes('4') && !error.message.includes('429')) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < this.config.retryAttempts) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Normalizes Lightstone API response to standard format
   * 
   * @private
   * @param response - Raw API response
   * @returns Normalized SuburbAddressResponse
   */
  private normalizeAddressResponse(response: any): SuburbAddressResponse {
    // Handle various response formats from Lightstone
    const addresses = Array.isArray(response)
      ? response
      : Array.isArray(response.data)
      ? response.data
      : Array.isArray(response.addresses)
      ? response.addresses
      : [];

    const normalizedAddresses: AddressData[] = addresses.map((addr: any) => ({
      addressId: addr.id || addr.addressId || '',
      fullAddress: addr.fullAddress || addr.address || `${addr.streetNumber || ''} ${addr.streetName || ''}`.trim(),
      streetName: addr.streetName || '',
      streetNumber: addr.streetNumber,
      suburbName: addr.suburb || addr.suburbName || '',
      province: addr.province || addr.state || '',
      postalCode: addr.postalCode || addr.zipCode,
      coordinates: addr.coordinates || (addr.lat && addr.lon ? { latitude: addr.lat, longitude: addr.lon } : undefined),
    }));

    return {
      success: true,
      data: normalizedAddresses,
      totalCount: response.totalCount || response.total || addresses.length,
      pageSize: response.pageSize || addresses.length,
      pageNumber: response.pageNumber || 1,
    };
  }

  /**
   * Prepares request headers with authentication
   * 
   * @private
   * @returns Request headers object
   */
  private getRequestHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json, image/*',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-API-Key': this.config.apiKey,
      'User-Agent': 'DG-CRM-Property-Platform/1.0',
    };
  }

  /**
   * Retrieves value from cache if not expired
   * 
   * @private
   * @param key - Cache key
   * @returns Cached value or null
   */
  private getFromCache(key: string): any | null {
    const cached = this.requestCache.get(key);
    
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.cacheExpiry;
    
    if (isExpired) {
      this.requestCache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Stores value in cache with timestamp
   * 
   * @private
   * @param key - Cache key
   * @param data - Data to cache
   */
  private setInCache(key: string, data: any): void {
    this.requestCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Handles and formats API errors
   * 
   * @private
   * @param error - Error object
   * @param message - Custom error message
   * @returns Formatted ApiError
   */
  private handleError(error: any, message: string): ApiError {
    const apiError: ApiError = {
      code: 'LIGHTSTONE_API_ERROR',
      message,
      status: error.status || 500,
      originalError: error instanceof Error ? error : undefined,
    };

    // Map specific error codes
    if (error.message?.includes('404')) {
      apiError.code = 'RESOURCE_NOT_FOUND';
      apiError.status = 404;
    } else if (error.message?.includes('401') || error.message?.includes('403')) {
      apiError.code = 'AUTHENTICATION_FAILED';
      apiError.status = error.status || 401;
      apiError.message = 'Invalid or missing Lightstone API credentials';
    } else if (error.message?.includes('429')) {
      apiError.code = 'RATE_LIMIT_EXCEEDED';
      apiError.status = 429;
      apiError.message = 'Too many requests. Please try again later.';
    } else if (error.message?.includes('AbortError') || error.name === 'AbortError') {
      apiError.code = 'REQUEST_TIMEOUT';
      apiError.status = 408;
      apiError.message = `Request timeout after ${this.config.timeout}ms`;
    }

    console.error(`[LightstoneService] ${apiError.code}: ${apiError.message}`, error);

    return apiError;
  }

  /**
   * Clears the request cache
   * Useful for testing and cache management
   */
  clearCache(): void {
    this.requestCache.clear();
    console.log('[LightstoneService] Cache cleared');
  }

  /**
   * Returns cache statistics for debugging
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.requestCache.size,
      entries: Array.from(this.requestCache.keys()),
    };
  }

  /**
   * Validates configuration
   */
  isConfigured(): boolean {
    return !!this.config.apiKey && this.config.apiKey !== '';
  }
}

// Create and export singleton instance
const lightstoneService = new LightstoneService();

export default lightstoneService;
export type { LightstoneConfig, StaticMapParams, AddressData, SuburbAddressResponse, ApiError };
