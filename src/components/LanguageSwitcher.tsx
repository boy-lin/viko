import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";

export function LanguageSwitcher({ className }: { className?: string }) {
    const { i18n } = useTranslation();

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
    };

    const languages = {
        en: "English",
        zh: "中文",
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className={`cursor-pointer w-8 h-8 ${className}`}>
                    <Globe className="h-4 w-4" />
                    <span className="sr-only">Switch Language</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className='space-y-1'>
                {Object.entries(languages).map(([key, label]) => (
                    <DropdownMenuItem
                        key={key}
                        onClick={() => changeLanguage(key)}
                        className={i18n.language.startsWith(key) ? "font-bold bg-accent" : "cursor-pointer"}
                    >
                        {label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
