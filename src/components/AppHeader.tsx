import { Link } from 'react-router-dom';
import { Github } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';

export function AppHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-4xl flex h-12 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <img src="/xpense.png" alt="Xpense Logo" className="h-8 w-8" />
          <span className="text-base">Xpense</span>
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
            {t('app.tagline')}
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
          <Button variant="ghost" size="icon" asChild aria-label={t('app.githubAria')}>
            <a
              href="https://github.com/dinhanhthi/xpense"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
