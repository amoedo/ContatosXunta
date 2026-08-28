import { useEffect, useState } from 'react';
import AnalysisSections, { type AnalysisSection } from './AnalysisSections';

type Language = 'gl' | 'es';

export default function AnalysisRoute({ section }: { section: AnalysisSection }) {
  const [language, setLanguage] = useState<Language>('gl');

  useEffect(() => {
    setLanguage(document.documentElement.lang === 'es' ? 'es' : 'gl');
  }, []);

  return (
    <AnalysisSections
      language={language}
      year={null}
      years={[]}
      onYearChange={() => undefined}
      section={section}
    />
  );
}