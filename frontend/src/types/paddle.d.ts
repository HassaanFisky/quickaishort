declare global {
  interface Window {
    Paddle?: {
      Initialize: (options: {
        token: string;
        eventCallback?: (event: { name: string; data: Record<string, unknown> }) => void;
      }) => void;
      Environment?: {
        set: (env: "production" | "sandbox") => void;
      };
      Checkout: {
        open: (options: {
          items: Array<{ priceId: string; quantity: number }>;
          customData?: Record<string, string>;
          successUrl?: string;
          settings?: {
            displayMode?: "overlay" | "inline";
            theme?: "light" | "dark";
            locale?: string;
            frameTarget?: string;
            frameInitialHeight?: number;
            frameStyle?: string;
          };
        }) => void;
      };
    };
  }
}

export {};
