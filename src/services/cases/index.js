/**
 * Case Service
 * Handles all case-related API calls and business logic
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Generic API call helper
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE_URL}/api/cases${endpoint}`;
  
  // Don't set Content-Type for FormData (browser will set it with boundary)
  const defaultOptions = {
    headers: options.body instanceof FormData ? {} : {
      'Content-Type': 'application/json',
    },
  };

  const response = await fetch(url, { ...defaultOptions, ...options });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Case CRUD operations
export const caseService = {
  // Get all cases with pagination and filters
  async getCases(params = {}) {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value);
      }
    });

    const queryString = searchParams.toString();
    return apiCall(queryString ? `?${queryString}` : '');
  },

  // Get a specific case by ID
  async getCase(id) {
    return apiCall(`/${id}`);
  },

  // Create a new case
  async createCase(caseData) {
    // Create FormData for file uploads
    const formData = new FormData();
    
    // Add all text fields
    Object.keys(caseData).forEach(key => {
      if (key === 'documents') {
        // Handle documents separately
        const documentsMetadata = caseData.documents.map(doc => ({
          uniqueDocumentId: doc.uniqueDocumentId,
          title: doc.title,
          originalName: doc.file ? doc.file.name : doc.originalName,
          description: doc.description,
          fileSize: doc.file ? doc.file.size : doc.fileSize,
          mimeType: doc.file ? doc.file.type : doc.mimeType,
          documentType: doc.documentType,
          tags: doc.tags,
          filePath: doc.filePath,
          isExisting: doc.isExisting,
          id: doc.id
        }));
        
        formData.append('documentsMetadata', JSON.stringify(documentsMetadata));
        
        // Add actual files (only for new documents with files)
        caseData.documents.forEach((doc, index) => {
          if (doc.file) {
            formData.append(`document_${index}`, doc.file);
          }
        });
      } else if (key === 'documentsToDelete') {
        formData.append('documentsToDelete', JSON.stringify(caseData.documentsToDelete || []));
      } else if (typeof caseData[key] === 'object' && caseData[key] !== null) {
        formData.append(key, JSON.stringify(caseData[key]));
      } else if (caseData[key] !== null && caseData[key] !== undefined) {
        formData.append(key, caseData[key]);
      }
    });
    
    return apiCall('', {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - browser will set it with boundary
      headers: {}
    });
  },

  // Update an existing case
  async updateCase(id, caseData) {
    // Create FormData for file uploads
    const formData = new FormData();
    
    // Add all text fields
    Object.keys(caseData).forEach(key => {
      if (key === 'documents') {
        // Handle documents separately
        const documentsMetadata = caseData.documents.map(doc => ({
          uniqueDocumentId: doc.uniqueDocumentId,
          title: doc.title,
          originalName: doc.file ? doc.file.name : doc.originalName,
          description: doc.description,
          fileSize: doc.file ? doc.file.size : doc.fileSize,
          mimeType: doc.file ? doc.file.type : doc.mimeType,
          documentType: doc.documentType,
          tags: doc.tags,
          filePath: doc.filePath,
          isExisting: doc.isExisting,
          id: doc.id
        }));
        
        formData.append('documentsMetadata', JSON.stringify(documentsMetadata));
        
        // Add actual files (only for new documents with files)
        caseData.documents.forEach((doc, index) => {
          if (doc.file) {
            formData.append(`document_${index}`, doc.file);
          }
        });
      } else if (key === 'documentsToDelete') {
        formData.append('documentsToDelete', JSON.stringify(caseData.documentsToDelete || []));
      } else if (typeof caseData[key] === 'object' && caseData[key] !== null) {
        formData.append(key, JSON.stringify(caseData[key]));
      } else if (caseData[key] !== null && caseData[key] !== undefined) {
        formData.append(key, caseData[key]);
      }
    });
    
    return apiCall(`/${id}`, {
      method: 'PUT',
      body: formData,
      // Don't set Content-Type header - browser will set it with boundary
      headers: {}
    });
  },

  // Delete a case
  async deleteCase(id) {
    return apiCall(`/${id}`, {
      method: 'DELETE',
    });
  },

  // Get reference data for forms
  async getReferenceData() {
    return apiCall('/reference-data');
  },

  // Extract case fields + parties from an uploaded document (for form auto-fill).
  // `language` ('en' | 'ar') controls the language of free-text values.
  // Returns { success, fields, parties, document, warnings }. Does not persist anything.
  async extractCaseFromDocument(file, language = 'en') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('language', language === 'ar' ? 'ar' : 'en');

    return apiCall('/extract', {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - browser will set it with boundary
      headers: {},
    });
  },

  // Clean up orphaned document records
  async cleanupOrphanedDocs(caseId) {
    return apiCall('/cleanup-orphaned-docs', {
      method: 'POST',
      body: JSON.stringify({ caseId }),
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};

// Document operations
export const documentService = {
  // Get document download URL from backend
  async getDocumentUrl(filePath) {
    try {
      const response = await fetch('/api/documents/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get document URL');
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error('Document URL generation failed:', error);
      throw error;
    }
  },

  // Delete document from Supabase storage
  async deleteDocument(filePath) {
    const { createClient } = await import('@supabase/supabase-js');
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase.storage
      .from('legal-documents')
      .remove([filePath]);

    if (error) {
      throw new Error(`Failed to delete document: ${error.message}`);
    }
  },

  // Process document for AI search (moved to backend)
  async processDocument(file, metadata) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('caseId', metadata.caseId);
    formData.append('documentId', metadata.documentId);
    formData.append('documentTitle', metadata.documentTitle);
    formData.append('documentType', metadata.documentType || 'unknown');

    const response = await fetch('/api/documents/process', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || 'Failed to process document');
    }

    return await response.json();
  },

  // Search documents using AI
  async searchDocuments(query, filters = {}) {
    const response = await fetch('/api/documents/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        ...filters
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || 'Search failed');
    }

    return await response.json();
  },

  // Delete document from AI search
  async deleteDocumentFromSearch(documentId) {
    const response = await fetch('/api/documents/process', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ documentId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || 'Failed to delete document from search');
    }

    return await response.json();
  }
};

export default caseService;
