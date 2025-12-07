"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProfileModal } from "@/components/profile/ProfileModal";

type ClientLayoutProps = {
    children: React.ReactNode;
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
    };
};

export function ClientLayout({ children, user }: ClientLayoutProps) {
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    return (
        <div className="flex flex-col min-h-screen bg-pic-dark text-white font-sans selection:bg-neon-pink selection:text-white">
            <Header
                userName={user.name}
                userRole={user.role}
                onOpenProfile={() => setIsProfileOpen(true)}
            />

            <main className="flex-1 overflow-auto relative flex flex-col">
                {children}
            </main>

            <Footer />

            <ProfileModal
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
            />
        </div>
    );
}
