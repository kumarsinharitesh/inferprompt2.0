import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface User {
    id: string;
    name: string;
    email: string;
}

interface AuthContextType {
    user: User | null;
    credits: number;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (user: User, credits: number) => void;
    logout: () => void;
    refreshUser: () => Promise<void>;
    setCredits: (newCredits: number) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
    return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [credits, setCreditsState] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        try {
            const res = await fetch(`/api/auth/me`, {
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                setUser(data.user ?? null);
                setCreditsState(typeof data.credits === "number" ? data.credits : 0);
            } else {
                setUser(null);
                setCreditsState(0);
            }
        } catch (err) {
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    const login = (newUser: User, initialCredits: number) => {
        setUser(newUser);
        setCreditsState(initialCredits);
    };

    const logout = async () => {
        try {
            await fetch(`/api/auth/logout`, {
                method: "POST",
                credentials: "include"
            });
        } catch (err) {
            console.error("Logout error", err);
        }
        setUser(null);
        setCreditsState(0);
    };

    const setCredits = (newCredits: number) => {
        setCreditsState(newCredits);
    };

    return (
        <AuthContext.Provider value={{ user, credits, isAuthenticated: !!user, isLoading, login, logout, refreshUser, setCredits }}>
            {children}
        </AuthContext.Provider>
    );
};
