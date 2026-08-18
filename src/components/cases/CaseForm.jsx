'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { caseService, documentService } from '@/services/cases';
import { CASE_CATEGORIES, CASE_SUBTYPES, CASE_STAGES, DOCUMENT_TAGS } from '@/services/cases/referenceOptions';
import { Plus, X, Upload, FileText, Calendar, User, MapPin, Phone, Mail, Tag, Building2, Scale, Users, Gavel, Eye, Loader2, AlertCircle, LayoutDashboard, StickyNote, Files } from 'lucide-react';

export default function CaseForm({ onSubmit, initialData = null, initialParties = null, initialFiles = null, initialDocumentMeta = null, isEditing = false, isSubmitting: externalIsSubmitting = false }) {
  const { data: session } = useSession();
  const { t, isRTL } = useTranslations();

  // Form state
  const [activeTab, setActiveTab] = useState("details");
  const [formData, setFormData] = useState({
    serialNumber: initialData?.serialNumber || '',
    caseNumber: initialData?.caseNumber || '',
    caseType: initialData?.caseType || '',
    caseCategory: initialData?.caseCategory || '',
    caseSubType: initialData?.caseSubType || '',
    currentStage: initialData?.currentStage || '',
    publicProsecutorMemo: initialData?.publicProsecutorMemo || '',
    status: initialData?.status || 'active',
    priority: initialData?.priority || 'medium',
    assignedTo: initialData?.assignedTo || '',
    filedDate: initialData?.filedDate ? new Date(initialData.filedDate).toISOString().split('T')[0] : '',
    nextHearing: initialData?.nextHearing ? new Date(initialData.nextHearing).toISOString().split('T')[0] : '',
  });

  // Separate state for parties (defendants, plaintiffs, etc.).
  // Seed from initialParties when provided (document auto-fill flow).
  const [parties, setParties] = useState(() =>
    (initialParties || []).map((p, index) => ({
      id: `${Date.now()}-${index}-${Math.random()}`,
      name: p.name || '',
      civilId: p.civilId || '',
      role: p.role || 'defendant',
      address: p.address || '',
      phone: p.phone || '',
      email: p.email || '',
      notes: p.notes || '',
      isActive: p.isActive !== false,
    }))
  );

  // Reference data state
  const [categories, setCategories] = useState([]);
  const [subTypes, setSubTypes] = useState([]);
  const [statusStages, setStatusStages] = useState([]);
  const [documentTags, setDocumentTags] = useState([]);
  const [loading, setLoading] = useState(true);

  // Validation state
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  const [documents, setDocuments] = useState([]);
  const [documentsToDelete, setDocumentsToDelete] = useState([]);
  const [previewUrls, setPreviewUrls] = useState({});
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const previewUrlsRef = useRef({});
  const [internalIsSubmitting, setInternalIsSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Use external isSubmitting if provided, otherwise use internal state
  const isSubmitting = externalIsSubmitting || internalIsSubmitting;

  // Load reference data on component mount
  useEffect(() => {
    // For create mode, use shared static reference data immediately
    if (!isEditing) {
      setCategories(CASE_CATEGORIES);
      setSubTypes(CASE_SUBTYPES);
      setStatusStages(CASE_STAGES);
      setDocumentTags(DOCUMENT_TAGS);
      setLoading(false);
    } else {
      // For edit mode, load from API
      const loadReferenceData = async () => {
        try {
          const data = await caseService.getReferenceData();
          setCategories(data.categories || []);
          setSubTypes(data.subTypes || []);
          setStatusStages(data.statusStages || []);
          setDocumentTags(data.documentTags || []);
          setLoading(false);
        } catch (error) {
          console.error('Error loading reference data:', error);
          setLoading(false);
        }
      };
      loadReferenceData();
    }
  }, [isEditing]);

  // Clear the sub-type only when it no longer belongs to the selected category
  // (create mode). This preserves a valid pre-filled sub-type on mount while
  // still clearing a stale one when the user changes category.
  useEffect(() => {
    if (isEditing) return;
    if (!formData.caseCategory) return;
    if (subTypes.length === 0) return; // options not loaded yet — don't wipe a prefill
    const valid = subTypes.some(
      s => s.categoryId === formData.caseCategory && s.name === formData.caseSubType
    );
    if (formData.caseSubType && !valid) {
      setFormData(prev => ({ ...prev, caseSubType: '' }));
    }
  }, [formData.caseCategory, isEditing, subTypes]);

  // Seed documents from a pre-uploaded file (auto-fill flow), once on mount, so
  // the document that was used for extraction is attached to the case on submit.
  // AI-suggested metadata (title/type/description/tags) applies to the first file.
  const initialFilesLoadedRef = useRef(false);
  useEffect(() => {
    if (initialFilesLoadedRef.current) return;
    if (initialFiles && initialFiles.length > 0) {
      initialFilesLoadedRef.current = true;
      const meta = initialDocumentMeta || {};
      const seeded = initialFiles.map((file, index) => {
        const suggested = index === 0 ? meta : {};
        return {
          id: `${Date.now()}-${Math.random()}-${index}`,
          uniqueDocumentId: generateUniqueDocumentId(),
          file,
          title: suggested.title || file.name.split('.').slice(0, -1).join('.') || file.name,
          description: suggested.description || '',
          documentType: suggested.documentType || '',
          tags: Array.isArray(suggested.tags) ? suggested.tags : [],
          originalName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          isExisting: false,
          filePath: null,
          uploadedAt: null,
        };
      });
      setDocuments(prev => [...prev, ...seeded]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);


  // Initialize documents from initialData when editing
  useEffect(() => {
    if (isEditing && initialData?.documents) {
      const formattedDocuments = initialData.documents.map((doc, index) => ({
        id: doc.id || `doc-${index}`,
        file: null, // No file object for existing documents
        uniqueDocumentId: doc.uniqueDocumentId,
        title: doc.title,
        originalName: doc.originalName,
        description: doc.description || '',
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        documentType: doc.documentType || '',
        tags: doc.tags || [], // Ensure tags is an array
        isExisting: true,
        filePath: doc.filePath || '',
        uploadedAt: doc.uploadedAt || null
      }));
      setDocuments(formattedDocuments);
      setDocumentsToDelete([]);
      setPreviewUrls({});
    }
  }, [isEditing, initialData]);

  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, []);


  // Ensure all form fields are properly set when editing and reference data is loaded
  useEffect(() => {
    if (isEditing && initialData && subTypes.length > 0) {
      // Set all form fields from initial data
      setFormData(prev => ({
        ...prev,
        caseCategory: initialData.caseCategory || '',
        caseSubType: initialData.caseSubType || '',
        currentStage: initialData.currentStage || '',
        assignedTo: initialData.assignedTo || ''
      }));
    }
  }, [isEditing, initialData, subTypes]);

  // Initialize parties from initialData when editing.
  // In create mode, parties come from the `initialParties` seed in the useState
  // initializer (document auto-fill) — do NOT reset here or the prefill is wiped.
  useEffect(() => {
    if (isEditing && initialData?.parties) {
      setParties(initialData.parties || []);
    }
  }, [isEditing, initialData]);

  // Handle input changes
  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };



  // Validation functions
  const validateCivilId = (civilId) => {
    if (!civilId) return true; // Optional field
    // Kuwait Civil ID format: 12 digits
    const civilIdRegex = /^\d{12}$/;
    return civilIdRegex.test(civilId);
  };

  const scrollToFirstError = (errorKeys) => {
    // Priority order for scrolling to errors
    const priorityFields = [
      'serialNumber',
      'caseNumber',
      'caseCategory',
      'parties',
      'document_0_title',
      'document_1_title',
      'document_2_title',
      'document_3_title',
      'document_4_title'
    ];

    // Find the first error field in priority order
    let firstErrorField = null;
    for (const field of priorityFields) {
      if (errorKeys.includes(field)) {
        firstErrorField = field;
        break;
      }
    }

    // If no priority field found, use the first error
    if (!firstErrorField && errorKeys.length > 0) {
      firstErrorField = errorKeys[0];
    }

    if (firstErrorField) {
      // Switch to appropriate tab based on error field
      if (firstErrorField === 'parties' || firstErrorField.startsWith('party_')) {
        setActiveTab('parties');
      } else if (firstErrorField.startsWith('document_')) {
        setActiveTab('documents');
      } else if (firstErrorField === 'publicProsecutorMemo') {
        setActiveTab('notes');
      } else {
        setActiveTab('details');
      }

      // Handle special cases
      if (firstErrorField === 'parties') {
        // Scroll to parties section
        const partiesSection = document.querySelector('[data-section="parties"]');
        if (partiesSection) {
          partiesSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }

      // Handle document title errors
      if (firstErrorField.startsWith('document_') && firstErrorField.endsWith('_title')) {
        const docIndex = parseInt(firstErrorField.split('_')[1]);
        if (documents[docIndex]?.id) {
          // Try getElementById first
          let docTitleInput = document.getElementById(`doc-title-${documents[docIndex].id}`);

          // Fallback: try to find by attribute selector
          if (!docTitleInput) {
            docTitleInput = document.querySelector(`[id="doc-title-${documents[docIndex].id}"]`);
          }

          // Fallback: find by data attribute or class
          if (!docTitleInput) {
            const docElement = document.querySelector(`[data-doc-id="${documents[docIndex].id}"]`);
            if (docElement) {
              docTitleInput = docElement.querySelector('input[placeholder*="title"], input[placeholder*="Title"]');
            }
          }

          if (docTitleInput) {
            docTitleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            docTitleInput.focus();
            return;
          }
        }
      }

      // Handle party civil ID errors
      if (firstErrorField.startsWith('party_') && firstErrorField.endsWith('_civilId')) {
        const partyIndex = parseInt(firstErrorField.split('_')[1]);
        if (parties[partyIndex]?.id) {
          // Try getElementById first
          let partyCivilIdInput = document.getElementById(`party-civilId-${parties[partyIndex].id}`);

          // Fallback: try to find by attribute selector
          if (!partyCivilIdInput) {
            partyCivilIdInput = document.querySelector(`[id="party-civilId-${parties[partyIndex].id}"]`);
          }

          // Fallback: find by data attribute or class
          if (!partyCivilIdInput) {
            const partyElement = document.querySelector(`[data-party-id="${parties[partyIndex].id}"]`);
            if (partyElement) {
              partyCivilIdInput = partyElement.querySelector('input[placeholder*="civil"], input[placeholder*="Civil"]');
            }
          }

          if (partyCivilIdInput) {
            partyCivilIdInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            partyCivilIdInput.focus();
            return;
          }
        }
      }

      // Handle regular form fields
      const errorElement = document.querySelector(`#${firstErrorField}`);
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        errorElement.focus();
      } else {
        // Fallback: scroll to top of form if element not found
        const formElement = document.querySelector('form');
        if (formElement) {
          formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Required fields
    if (!formData.serialNumber.trim()) {
      newErrors.serialNumber = t('validation.serialNumberRequired');
    }
    if (!formData.caseNumber.trim()) {
      newErrors.caseNumber = t('validation.caseNumberRequired');
    }
    if (!formData.caseCategory.trim()) {
      newErrors.caseCategory = t('validation.caseTypeRequired');
    }

    // Validate parties
    parties.forEach((party, index) => {
      if (party.name.trim() && !validateCivilId(party.civilId)) {
        newErrors[`party_${index}_civilId`] = t('validation.invalidCivilId');
      }
    });

    // At least one party must have both name and civil ID
    const hasValidParty = parties.some(p => p.name.trim() && p.civilId.trim());

    if (!hasValidParty) {
      newErrors.parties = t('validation.atLeastOnePartyRequired');
    }

    // Validate document titles
    documents.forEach((doc, index) => {
      if (!doc.title.trim()) {
        newErrors[`document_${index}_title`] = t('validation.documentTitleRequired');
      }
    });

    setErrors(newErrors);

    // Scroll to first error if validation fails
    if (Object.keys(newErrors).length > 0) {
      setTimeout(() => {
        scrollToFirstError(Object.keys(newErrors));
      }, 100); // Small delay to ensure DOM is updated
    }

    return Object.keys(newErrors).length === 0;
  };

  // Handle document upload
  const handleDocumentUpload = (event) => {
    const files = Array.from(event.target.files);
    addDocuments(files);

    // Clear the input so the same file can be selected again
    event.target.value = '';
  };

  // Generate unique document ID
  const generateUniqueDocumentId = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `DOC-${timestamp}-${random}`.toUpperCase();
  };

  // Add documents helper function
  const addDocuments = (files) => {
    if (!files || files.length === 0) {
      return;
    }

    const newDocuments = files.map((file, index) => ({
      id: `${Date.now()}-${Math.random()}-${index}`,
      uniqueDocumentId: generateUniqueDocumentId(),
      file,
      title: file.name.split('.').slice(0, -1).join('.') || file.name,
      description: '',
      documentType: '',
      tags: [],
      originalName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      isExisting: false,
      filePath: null,
      uploadedAt: null
    }));
    setDocuments(prev => [...prev, ...newDocuments]);
  };

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    addDocuments(files);
  };

  // Remove document
  const getDocumentPreviewKey = (doc) => doc.filePath || doc.id;

  const removeDocument = (documentId) => {
    setDocuments(prev => {
      const documentToRemove = prev.find(doc => doc.id === documentId);
      if (!documentToRemove) {
        return prev.filter(doc => doc.id !== documentId);
      }

      if (documentToRemove.isExisting && documentToRemove.filePath) {
        setDocumentsToDelete(prevDelete => Array.from(new Set([...prevDelete, documentToRemove.filePath])));
      }

      const previewKey = getDocumentPreviewKey(documentToRemove);
      if (previewKey && previewUrls[previewKey] && documentToRemove.file) {
        URL.revokeObjectURL(previewUrls[previewKey]);
        setPreviewUrls(prevUrls => {
          const updated = { ...prevUrls };
          delete updated[previewKey];
          return updated;
        });
      }

      return prev.filter(doc => doc.id !== documentId);
    });
  };

  // Update document title
  const updateDocumentTitle = (documentId, title) => {
    setDocuments(prev => prev.map(doc =>
      doc.id === documentId ? { ...doc, title } : doc
    ));
  };

  // Party management functions
  const addParty = (role = 'defendant') => {
    const newParty = {
      id: Date.now() + Math.random(),
      name: '',
      civilId: '',
      role: role,
      address: '',
      phone: '',
      email: '',
      notes: '',
      isActive: true
    };
    setParties(prev => [...prev, newParty]);
  };

  const updateParty = (partyId, field, value) => {
    setParties(prev => prev.map(party =>
      party.id === partyId ? { ...party, [field]: value } : party
    ));
  };

  const removeParty = (partyId) => {
    setParties(prev => prev.filter(party => party.id !== partyId));
  };

  // Update document description
  const updateDocumentDescription = (documentId, description) => {
    setDocuments(prev => prev.map(doc =>
      doc.id === documentId ? { ...doc, description } : doc
    ));
  };

  // Update document type
  const updateDocumentType = (documentId, documentType) => {
    setDocuments(prev => prev.map(doc =>
      doc.id === documentId ? { ...doc, documentType } : doc
    ));
  };

  // Toggle document tag
  const toggleDocumentTag = (documentId, tagId) => {
    setDocuments(prev => prev.map(doc => {
      if (doc.id === documentId) {
        const tag = documentTags.find(t => t.id === tagId);
        const tagName = tag ? tag.name : tagId;
        return {
          ...doc,
          tags: doc.tags.includes(tagName)
            ? doc.tags.filter(t => t !== tagName)
            : [...doc.tags, tagName]
        };
      }
      return doc;
    }));
  };

  const handlePreviewDocument = async (document) => {
    if (!document) return;

    const previewKey = getDocumentPreviewKey(document);

    if (document.file) {
      const existingBlobUrl = previewUrls[previewKey];
      if (existingBlobUrl) {
        window.open(existingBlobUrl, '_blank', 'noopener');
        return;
      }

      const blobUrl = URL.createObjectURL(document.file);
      setPreviewUrls(prev => ({ ...prev, [previewKey]: blobUrl }));
      window.open(blobUrl, '_blank', 'noopener');
      return;
    }

    if (!document.filePath) return;

    const existingUrl = previewUrls[previewKey];
    if (existingUrl) {
      window.open(existingUrl, '_blank', 'noopener');
      return;
    }

    try {
      setPreviewLoadingId(document.id);
      const url = await documentService.getDocumentUrl(document.filePath);
      setPreviewUrls(prev => ({ ...prev, [previewKey]: url }));
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      console.error('Failed to load document preview', error);

      // If the file is missing from storage, mark it for removal and show a warning
      if (error.message?.includes('not found in storage')) {
        setDocuments(prev => prev.map(doc =>
          doc.id === document.id
            ? { ...doc, isMissing: true, missingReason: 'File not found in storage' }
            : doc
        ));
        setSubmitError(t('cases.documentMissingFromStorage'));
      } else {
        setSubmitError(error.message || t('cases.documentPreviewError'));
      }

      // Scroll to the error message area
      setTimeout(() => {
        const errorElement = document.querySelector('[data-error-area]');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleCleanupMissingDocs = async () => {
    if (!isEditing || !initialData?.id) return;

    try {
      setInternalIsSubmitting(true);
      const result = await caseService.cleanupOrphanedDocs(initialData.id);

      // Remove missing documents from the UI
      setDocuments(prev => prev.filter(doc => !doc.isMissing));
      setDocumentsToDelete([]);

      console.log('Cleanup completed:', result);
      setSubmitError(''); // Clear any previous errors
    } catch (error) {
      console.error('Failed to cleanup missing documents:', error);
      setSubmitError(t('cases.cleanupError'));

      // Scroll to the error message area
      setTimeout(() => {
        const errorElement = document.querySelector('[data-error-area]');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } finally {
      setInternalIsSubmitting(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Clear previous errors
    setSubmitError('');

    if (!validateForm()) {
      return;
    }

    setInternalIsSubmitting(true);

    try {
      // Filter out missing documents and add them to deletion list
      const missingDocuments = documents.filter(doc => doc.isMissing && doc.isExisting);
      const validDocuments = documents.filter(doc => !doc.isMissing);

      const caseData = {
        ...formData,
        // caseType has no dedicated field in the UI; derive it from the selected category
        caseType: formData.caseType?.trim() || formData.caseCategory,
        assignedTo: formData.assignedTo?.trim() || null,
        parties: parties.filter(p => p.name.trim() !== ''),
        documents: validDocuments.map(doc => ({
          file: doc.file,
          uniqueDocumentId: doc.uniqueDocumentId,
          title: doc.title,
          description: doc.description,
          documentType: doc.documentType,
          tags: doc.tags,
          originalName: doc.originalName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          filePath: doc.filePath || null,
          isExisting: doc.isExisting || false,
          id: doc.id || null
        })),
        documentsToDelete: [
          ...documentsToDelete,
          ...missingDocuments.map(doc => doc.filePath).filter(Boolean)
        ]
      };

      // If onSubmit is provided, use it (for custom handling)
      if (onSubmit) {
        await onSubmit(caseData);
      } else {
        // Default API handling
        if (isEditing && initialData?.id) {
          await caseService.updateCase(initialData.id, caseData);
        } else {
          await caseService.createCase(caseData);
        }

        // Show success message or redirect
        // You can add toast notification here
        console.log('Case saved successfully');
      }
    } catch (error) {
      console.error('Error submitting case:', error);
      setSubmitError(error.message || 'Failed to create case');

      // Scroll to the error message area
      setTimeout(() => {
        const errorElement = document.querySelector('[data-error-area]');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } finally {
      setInternalIsSubmitting(false);
    }
  };

  // Show loading state while data is being loaded
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {isEditing ? t('cases.editCase') : t('cases.createCase')}
            </CardTitle>
            <CardDescription>
              {isEditing ? t('cases.editCaseDescription') : t('cases.createCaseDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading form data...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEditing ? t('cases.editCase') : t('cases.createCase')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditing ? t('cases.editCaseDescription') : t('cases.createCaseDescription')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="details">
              <LayoutDashboard className="h-4 w-4" />
              {t('cases.details') || 'Details'}
            </TabsTrigger>
            <TabsTrigger value="parties">
              <Users className="h-4 w-4" />
              {t('cases.parties')}
              {parties.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 rounded-full text-xs bg-white/20 text-current">
                  {parties.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="documents">
              <Files className="h-4 w-4" />
              {t('cases.documents')}
              {documents.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 rounded-full text-xs bg-white/20 text-current">
                  {documents.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="notes">
              <StickyNote className="h-4 w-4" />
              {t('cases.notes') || 'Notes'}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: DETAILS */}
          <TabsContent value="details" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('cases.caseInformation') || 'Case Information'}</CardTitle>
                <CardDescription>{t('cases.basicInfoDescription') || 'Enter the core details of the case.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic Case Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="serialNumber">{t('cases.serialNumber')}</Label>
                    <Input
                      id="serialNumber"
                      value={formData.serialNumber}
                      onChange={(e) => handleInputChange('serialNumber', e.target.value)}
                      placeholder={t('cases.serialNumberPlaceholder')}
                      required
                      className={isRTL ? 'text-right' : 'text-left'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="caseNumber">{t('cases.caseNumber')}</Label>
                    <Input
                      id="caseNumber"
                      value={formData.caseNumber}
                      onChange={(e) => handleInputChange('caseNumber', e.target.value)}
                      placeholder={t('cases.caseNumberPlaceholder')}
                      required
                      className={isRTL ? 'text-right' : 'text-left'}
                    />
                  </div>
                </div>

                {/* Case Category and Sub-Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="caseCategory">{t('cases.caseCategory')}</Label>
                    <Select
                      value={formData.caseCategory}
                      onValueChange={(value) => handleInputChange('caseCategory', value)}
                    >
                      <SelectTrigger id="caseCategory" className={isRTL ? 'text-right' : 'text-left'}>
                        <SelectValue placeholder={t('cases.selectCategory')} />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.length > 0 ? categories
                          .filter(category => category && category.name)
                          .map((category) => (
                            <SelectItem key={category.id} value={category.name}>
                              <div className="flex items-center gap-2">
                                <Scale className="h-4 w-4" />
                                <span>{isRTL ? category.nameAr : category.name}</span>
                              </div>
                            </SelectItem>
                          )) : (
                          <SelectItem value="loading-categories" disabled>
                            Loading categories...
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {errors.caseCategory && (
                      <p className="text-sm text-red-600">{errors.caseCategory}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="caseSubType">{t('cases.caseSubType')}</Label>
                    <Select
                      value={formData.caseSubType}
                      onValueChange={(value) => handleInputChange('caseSubType', value)}
                      disabled={!formData.caseCategory}
                    >
                      <SelectTrigger className={isRTL ? 'text-right' : 'text-left'}>
                        <SelectValue placeholder={t('cases.selectSubType')} />
                      </SelectTrigger>
                      <SelectContent>
                        {subTypes.length > 0 ? subTypes
                          .filter(st => st && st.categoryId === formData.caseCategory)
                          .map((subType) => (
                            <SelectItem key={subType.id} value={subType.name}>
                              <span>{isRTL ? subType.nameAr : subType.name}</span>
                            </SelectItem>
                          )) : (
                          <SelectItem value="loading-subtypes" disabled>
                            {formData.caseCategory ? 'Loading sub-types...' : 'Select a category first'}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Status and Priority */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="currentStage">{t('cases.currentStage')}</Label>
                    <Select
                      value={formData.currentStage}
                      onValueChange={(value) => handleInputChange('currentStage', value)}
                    >
                      <SelectTrigger className={isRTL ? 'text-right' : 'text-left'}>
                        <SelectValue placeholder={t('cases.selectStage')} />
                      </SelectTrigger>
                      <SelectContent>
                        {statusStages.length > 0 ? statusStages
                          .filter(stage => stage && stage.name)
                          .map((stage) => (
                            <SelectItem key={stage.id} value={stage.name}>
                              <div className="flex items-center gap-2">
                                <Gavel className="h-4 w-4" />
                                <span>{isRTL ? stage.nameAr : stage.name}</span>
                                {stage.isFinal && (
                                  <Badge variant="secondary" className="text-xs">
                                    {t('cases.final')}
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          )) : (
                          <SelectItem value="loading-stages" disabled>
                            Loading stages...
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">{t('cases.status')} ({t('cases.legacy')})</Label>
                    <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                      <SelectTrigger className={isRTL ? 'text-right' : 'text-left'}>
                        <SelectValue placeholder={t('cases.selectStatus')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t('status.active')}</SelectItem>
                        <SelectItem value="pending">{t('status.pending')}</SelectItem>
                        <SelectItem value="closed">{t('status.closed')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">{t('cases.priority')}</Label>
                    <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                      <SelectTrigger className={isRTL ? 'text-right' : 'text-left'}>
                        <SelectValue placeholder={t('cases.selectPriority')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">{t('priority.high')}</SelectItem>
                        <SelectItem value="medium">{t('priority.medium')}</SelectItem>
                        <SelectItem value="low">{t('priority.low')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Assigned To & Dates */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="assignedTo">{t('cases.assignedTo')}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="assignedTo"
                        type="text"
                        placeholder={t('cases.assignedToPlaceholder')}
                        value={formData.assignedTo}
                        onChange={(e) => handleInputChange('assignedTo', e.target.value)}
                        className={`pl-10 ${isRTL ? 'text-right' : 'text-left'}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="filedDate">{t('cases.filedDate')}</Label>
                    <DatePicker
                      value={formData.filedDate ? new Date(formData.filedDate) : undefined}
                      onChange={(date) => handleInputChange('filedDate', date ? date.toISOString().split('T')[0] : '')}
                      placeholder={t('cases.selectFiledDate')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nextHearing">{t('cases.nextHearing')}</Label>
                    <DatePicker
                      value={formData.nextHearing ? new Date(formData.nextHearing) : undefined}
                      onChange={(date) => handleInputChange('nextHearing', date ? date.toISOString().split('T')[0] : '')}
                      placeholder={t('cases.selectNextHearing')}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: PARTIES */}
          <TabsContent value="parties" className="space-y-6 mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t('cases.parties')}</CardTitle>
                  <CardDescription>{t('cases.partiesDescription') || 'Manage defendants, plaintiffs, and other parties involved in the case.'}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addParty('defendant')}
                    className={isRTL ? 'flex-row-reverse' : ''}
                  >
                    <Plus className={`h-4 w-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                    {t('cases.addDefendant')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addParty('plaintiff')}
                    className={isRTL ? 'flex-row-reverse' : ''}
                  >
                    <Plus className={`h-4 w-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                    {t('cases.addPlaintiff')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {parties.map((party, index) => (
                  <div key={party.id} className="space-y-3 p-4 border rounded-lg bg-muted/30" data-party-id={party.id}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {party.role}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {t('cases.party')} #{index + 1}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeParty(party.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`party-name-${party.id}`} className="text-sm text-muted-foreground">
                          {t('cases.partyName')} *
                        </Label>
                        <Input
                          id={`party-name-${party.id}`}
                          value={party.name}
                          onChange={(e) => updateParty(party.id, 'name', e.target.value)}
                          placeholder={t('cases.partyNamePlaceholder')}
                          className={isRTL ? 'text-right' : 'text-left'}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`party-civilId-${party.id}`} className="text-sm text-muted-foreground">
                          {t('cases.civilId')} *
                        </Label>
                        <Input
                          id={`party-civilId-${party.id}`}
                          value={party.civilId}
                          onChange={(e) => updateParty(party.id, 'civilId', e.target.value)}
                          placeholder={t('cases.civilIdPlaceholder')}
                          className={isRTL ? 'text-right' : 'text-left'}
                          maxLength={12}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`party-phone-${party.id}`} className="text-sm text-muted-foreground">
                          {t('cases.phone')}
                        </Label>
                        <Input
                          id={`party-phone-${party.id}`}
                          value={party.phone}
                          onChange={(e) => updateParty(party.id, 'phone', e.target.value)}
                          placeholder={t('cases.phonePlaceholder')}
                          className={isRTL ? 'text-right' : 'text-left'}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`party-email-${party.id}`} className="text-sm text-muted-foreground">
                          {t('cases.email')}
                        </Label>
                        <Input
                          id={`party-email-${party.id}`}
                          type="email"
                          value={party.email}
                          onChange={(e) => updateParty(party.id, 'email', e.target.value)}
                          placeholder={t('cases.emailPlaceholder')}
                          className={isRTL ? 'text-right' : 'text-left'}
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor={`party-address-${party.id}`} className="text-sm text-muted-foreground">
                          {t('cases.address')}
                        </Label>
                        <Textarea
                          id={`party-address-${party.id}`}
                          value={party.address}
                          onChange={(e) => updateParty(party.id, 'address', e.target.value)}
                          placeholder={t('cases.addressPlaceholder')}
                          className={isRTL ? 'text-right' : 'text-left'}
                          rows={2}
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor={`party-notes-${party.id}`} className="text-sm text-muted-foreground">
                          {t('cases.notes')}
                        </Label>
                        <Textarea
                          id={`party-notes-${party.id}`}
                          value={party.notes}
                          onChange={(e) => updateParty(party.id, 'notes', e.target.value)}
                          placeholder={t('cases.notesPlaceholder')}
                          className={isRTL ? 'text-right' : 'text-left'}
                          rows={2}
                        />
                      </div>
                    </div>

                    {errors[`party_${index}_civilId`] && (
                      <p className="text-sm text-red-600">{errors[`party_${index}_civilId`]}</p>
                    )}
                  </div>
                ))}

                {parties.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed rounded-lg">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p className="text-muted-foreground">{t('cases.noPartiesAdded')}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t('cases.addPartiesToContinue')}</p>
                  </div>
                )}

                {errors.parties && (
                  <p className="text-sm text-red-600">{errors.parties}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: DOCUMENTS */}
          <TabsContent value="documents" className="space-y-6 mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t('cases.documents')}</CardTitle>
                  <CardDescription>{t('cases.documentsDescription') || 'Upload and manage case files.'}</CardDescription>
                </div>
                {isEditing && documents.some(doc => doc.isMissing) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCleanupMissingDocs}
                    className="text-orange-600 border-orange-200 hover:bg-orange-50"
                  >
                    <X className="h-4 w-4 mr-2" />
                    {t('cases.cleanupMissingDocs')}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Upload Area */}
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 transition-colors",
                    isDragOver
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="text-center">
                    <div className={cn(
                      "mx-auto h-16 w-16 rounded-full flex items-center justify-center mb-4 transition-colors",
                      isDragOver
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}>
                      <Upload className="h-8 w-8" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-medium text-foreground">
                        {isDragOver ? t('cases.dropFilesHere') : t('cases.uploadDocuments')}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t('cases.uploadDocumentsDescription')}
                      </p>
                      <div className="flex items-center justify-center gap-4 mt-4">
                        <Label htmlFor="document-upload" className="cursor-pointer">
                          <Button type="button" variant="outline" className={`pointer-events-none ${isRTL ? 'flex-row-reverse' : ''}`}>
                            <Upload className={`h-4 w-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                            {t('cases.selectFiles')}
                          </Button>
                        </Label>
                        <span className="text-sm text-muted-foreground">
                          {t('cases.or')}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t('cases.dragAndDrop')}
                        </span>
                      </div>
                      <div className="mt-4 text-xs text-muted-foreground space-y-1">
                        <p>• {t('cases.multipleDocsTip')}</p>
                        <p>• {t('cases.docTitleRequired')}</p>
                      </div>
                      <input
                        id="document-upload"
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        onChange={handleDocumentUpload}
                        className="sr-only"
                      />
                    </div>
                  </div>
                </div>

                {/* Document List */}
                {documents.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-foreground">{t('cases.uploadedDocuments')} ({documents.length})</h4>
                    {documents.map((doc, index) => (
                      <div key={doc.id} className="space-y-3 p-4 border border-border rounded-lg bg-muted/30" data-doc-id={doc.id}>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {doc.originalName}
                              {doc.isMissing && (
                                <span className="ml-2 text-orange-600 text-xs">(File Missing)</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(doc.fileSize / 1024).toFixed(1)} KB • {doc.mimeType}
                              {doc.isMissing && (
                                <span className="ml-2 text-orange-600">• {doc.missingReason}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePreviewDocument(doc)}
                              disabled={previewLoadingId === doc.id}
                              title={t('cases.previewDocument')}
                            >
                              {previewLoadingId === doc.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeDocument(doc.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor={`doc-title-${doc.id}`} className="text-sm font-medium text-foreground">
                                {t('cases.documentTitle')} *
                              </Label>
                              <Input
                                id={`doc-title-${doc.id}`}
                                placeholder={t('cases.documentTitlePlaceholder')}
                                value={doc.title}
                                onChange={(e) => updateDocumentTitle(doc.id, e.target.value)}
                                className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}
                              />
                              {errors[`document_${index}_title`] && (
                                <p className="text-sm text-red-600 mt-1">{errors[`document_${index}_title`]}</p>
                              )}
                            </div>
                            <div>
                              <Label htmlFor={`doc-type-${doc.id}`} className="text-sm font-medium text-foreground">
                                {t('cases.documentType')}
                              </Label>
                              <Select
                                value={doc.documentType}
                                onValueChange={(value) => updateDocumentType(doc.id, value)}
                              >
                                <SelectTrigger className={isRTL ? 'text-right' : 'text-left'}>
                                  <SelectValue placeholder={t('cases.selectDocumentType')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="legal-document">{t('cases.legalDocument')}</SelectItem>
                                  <SelectItem value="evidence">{t('cases.evidence')}</SelectItem>
                                  <SelectItem value="contract">{t('cases.contract')}</SelectItem>
                                  <SelectItem value="correspondence">{t('cases.correspondence')}</SelectItem>
                                  <SelectItem value="court-order">{t('cases.courtOrder')}</SelectItem>
                                  <SelectItem value="expert-report">{t('cases.expertReport')}</SelectItem>
                                  <SelectItem value="financial-record">{t('cases.financialRecord')}</SelectItem>
                                  <SelectItem value="medical-record">{t('cases.medicalRecord')}</SelectItem>
                                  <SelectItem value="witness-statement">{t('cases.witnessStatement')}</SelectItem>
                                  <SelectItem value="other">{t('cases.other')}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div>
                            <Label htmlFor={`doc-desc-${doc.id}`} className="text-sm font-medium text-foreground">
                              {t('cases.documentDescription')}
                            </Label>
                            <Input
                              id={`doc-desc-${doc.id}`}
                              placeholder={t('cases.documentDescriptionPlaceholder')}
                              value={doc.description}
                              onChange={(e) => updateDocumentDescription(doc.id, e.target.value)}
                              className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}
                            />
                          </div>

                          <div>
                            <Label className="text-sm font-medium text-foreground">
                              {t('cases.documentTags')}
                            </Label>
                            <div className="flex flex-wrap gap-3 mt-2">
                              {documentTags
                                .filter(tag => tag && tag.name)
                                .map((tag) => (
                                  <div
                                    key={tag.id}
                                    className={cn(
                                      "flex items-center bg-muted/30 rounded-md px-3 py-2 border",
                                      isRTL ? 'space-x-reverse space-x-2' : 'space-x-2'
                                    )}
                                  >
                                    <Checkbox
                                      id={`doc-${doc.id}-tag-${tag.id}`}
                                      checked={doc.tags.includes(tag.name)}
                                      onCheckedChange={() => toggleDocumentTag(doc.id, tag.id)}
                                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                    />
                                    <Label
                                      htmlFor={`doc-${doc.id}-tag-${tag.id}`}
                                      className="text-sm font-normal cursor-pointer flex items-center gap-2 hover:text-foreground transition-colors"
                                    >
                                      <div
                                        className="w-3 h-3 rounded-full border border-border"
                                        style={{ backgroundColor: tag.color }}
                                      />
                                      <span>{isRTL ? tag.nameAr : tag.name}</span>
                                    </Label>
                                  </div>
                                ))}
                            </div>
                            {documentTags.length === 0 && (
                              <p className="text-sm text-muted-foreground mt-2">
                                {t('cases.noTagsAvailable')}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: NOTES */}
          <TabsContent value="notes" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('cases.notes') || 'Notes & Memos'}</CardTitle>
                <CardDescription>{t('cases.notesDescription') || 'Add internal notes and prosecutor memos.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="publicProsecutorMemo">{t('cases.publicProsecutorMemo')}</Label>
                  <Textarea
                    id="publicProsecutorMemo"
                    value={formData.publicProsecutorMemo}
                    onChange={(e) => handleInputChange('publicProsecutorMemo', e.target.value)}
                    placeholder={t('cases.publicProsecutorMemoPlaceholder')}
                    rows={8}
                    className={isRTL ? 'text-right' : 'text-left'}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Sticky Footer */}
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 rtl:lg:left-0 rtl:lg:right-64 bg-background border-t p-4 z-50 shadow-lg transition-all duration-200">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              {submitError && (
                <div className="text-sm text-red-600 font-medium flex items-center gap-2" data-error-area>
                  <AlertCircle className="h-4 w-4" />
                  {submitError}
                </div>
              )}
            </div>
            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.history.back()}
                disabled={isSubmitting}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('cases.saving')}
                  </>
                ) : (
                  isEditing ? t('cases.updateCase') : t('cases.createCase')
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
