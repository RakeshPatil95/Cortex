'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { CaseForm } from '@/components/cases';
import { caseService } from '@/services/cases';
import { useTranslations } from '@/lib/translations';

export default function EditCasePage({ params }) {
  const [caseData, setCaseData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { t, locale } = useTranslations();

  useEffect(() => {
    const fetchCase = async () => {
      try {
        const resolvedParams = await params;
        const data = await caseService.getCase(resolvedParams.id);
        setCaseData(data);
      } catch (error) {
        console.error('Error fetching case:', error);
        setError('Failed to load case data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCase();
  }, [params]);

  const handleSubmit = async (updatedCaseData) => {
    setIsSubmitting(true);
    setError('');

    try {
      const resolvedParams = await params;
      const updatedCase = await caseService.updateCase(resolvedParams.id, updatedCaseData);
      console.log('Case updated successfully:', updatedCase);
      
      // Redirect to dashboard
      router.push(`/${locale}/dashboard`);
    } catch (error) {
      console.error('Error updating case:', error);
      setError(error.message || 'Failed to update case');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading case data...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        <CaseForm 
          onSubmit={handleSubmit} 
          initialData={caseData}
          isEditing={true}
          isSubmitting={isSubmitting}
        />
      </div>
    </MainLayout>
  );
}
