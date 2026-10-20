import { useEffect, useState } from 'react';

/** Phones are a monitoring surface; robot movement requires a larger viewport. */
export function useCompactScreen() {
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 599px)').matches);
  useEffect(() => {
    const query = matchMedia('(max-width: 599px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return compact;
}
