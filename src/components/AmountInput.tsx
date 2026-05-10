import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseAmountToMinor, minorToMajorString } from '@/lib/format';

export function AmountInput({
  value,
  decimals,
  onChange,
  placeholder = '0.00',
  id,
}: {
  value: number;
  decimals: number;
  onChange: (minor: number) => void;
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState(() => (value === 0 ? '' : minorToMajorString(value, decimals)));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const parsed = parseAmountToMinor(text, decimals);
    if (parsed !== value) {
      setText(value === 0 ? '' : minorToMajorString(value, decimals));
    }
    // Only re-sync when the parent value changes (not on every keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);

  return (
    <Input
      id={id}
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      aria-invalid={invalid || undefined}
      className={invalid ? 'border-destructive focus-visible:ring-destructive' : undefined}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === '') {
          setInvalid(false);
          onChange(0);
          return;
        }
        const minor = parseAmountToMinor(raw, decimals);
        if (minor !== null) {
          setInvalid(false);
          onChange(minor);
        } else {
          setInvalid(true);
        }
      }}
    />
  );
}
