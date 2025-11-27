import React from "react";
import { TABS, TabKey } from "../tabs/tabConfig";

interface Props {
  active: TabKey;
  onChange: (key: TabKey) => void;
}

export const BottomTabNav: React.FC<Props> = ({ active, onChange }) => {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <div className="bottom-nav__inner">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              className={
                "bottom-nav__item" +
                (isActive ? " bottom-nav__item--active" : "")
              }
              onClick={() => onChange(tab.key)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="bottom-nav__icon" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="bottom-nav__label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
