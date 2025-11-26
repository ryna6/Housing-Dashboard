import React from "react";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="app">
      <main className="app__content">{children}</main>
    </div>
  );
};

export default Layout;

