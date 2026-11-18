import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { WizardPage } from '../../pages/WizardPage';

/** Keep the active job, progress and logs alive across application navigation. */
export function RetainedWizard() {
  const active = useLocation().pathname === '/wizard';
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  if (!active && !visited) return null;
  return <div hidden={!active} data-wizard-workspace><WizardPage /></div>;
}
