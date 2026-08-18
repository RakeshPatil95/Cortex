'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { CaseForm, CaseAutofillUpload } from '@/components/cases';
import { caseService } from '@/services/cases';
import { useTranslations } from '@/lib/translations';

export default function CreateCasePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('upload'); // 'upload' | 'form'
  const [prefill, setPrefill] = useState({ fields: {}, parties: [], document: null, files: [], warnings: [] });
  const router = useRouter();
  const { t, locale } = useTranslations();

  const handleExtracted = ({ fields, parties, document, file, warnings }) => {
    setPrefill({
      fields: fields || {},
      parties: parties || [],
      document: document || null,
      files: file ? [file] : [],
      warnings: warnings || [],
    });
    setStep('form');
  };

  const handleSkip = () => {
    setPrefill({ fields: {}, parties: [], document: null, files: [], warnings: [] });
    setStep('form');
  };

  const handleSubmit = async (caseData) => {
    setIsSubmitting(true);
    setError('');

    try {
      const newCase = await caseService.createCase(caseData);
      console.log('Case created successfully:', newCase);

      // Redirect to dashboard
      router.push(`/${locale}/dashboard`);
    } catch (error) {
      console.error('Error creating case:', error);
      setError(error.message || 'Failed to create case');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {step === 'upload' ? (
          <CaseAutofillUpload onExtracted={handleExtracted} onSkip={handleSkip} />
        ) : (
          <>
            {prefill.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm">
                {prefill.warnings.join(' ')}
              </div>
            )}
            <CaseForm
              onSubmit={handleSubmit}
              initialData={prefill.fields}
              initialParties={prefill.parties}
              initialFiles={prefill.files}
              initialDocumentMeta={prefill.document}
              isSubmitting={isSubmitting}
            />
          </>
        )}
      </div>
    </MainLayout>
  );
}
