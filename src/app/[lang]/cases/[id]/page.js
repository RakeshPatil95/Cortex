import MainLayout from '@/components/layout/MainLayout';
import CaseDetailContent from '@/components/cases/CaseDetailContent';

export default function CaseDetailPage({ params }) {
    return (
        <MainLayout>
            <CaseDetailContent caseId={params.id} />
        </MainLayout>
    );
}
