import type { MouseEvent, PointerEvent } from 'react';

export type MobileControlDirection = 'up' | 'down' | 'left' | 'right';

type MobileControlsProps = {
  isVisible: boolean;
  onDirectionChange: (direction: MobileControlDirection, pressed: boolean) => void;
};

const controlButtons: Array<{
  direction: MobileControlDirection;
  label: string;
  className: string;
}> = [
  { direction: 'up', label: '▲', className: 'mobile-controls__button--up' },
  { direction: 'left', label: '◀', className: 'mobile-controls__button--left' },
  { direction: 'right', label: '▶', className: 'mobile-controls__button--right' },
  { direction: 'down', label: '▼', className: 'mobile-controls__button--down' },
];

export function MobileControls({ isVisible, onDirectionChange }: MobileControlsProps) {
  if (!isVisible) {
    return null;
  }

  const bindPointerHandlers = (direction: MobileControlDirection) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onDirectionChange(direction, true);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onDirectionChange(direction, false);
    },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onDirectionChange(direction, false);
    },
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
    },
  });

  return (
    <div className="mobile-controls" aria-label="Mobile controls">
      <div className="mobile-controls__pad">
        {controlButtons.map((button) => (
          <button
            key={button.direction}
            type="button"
            className={`mobile-controls__button ${button.className}`}
            aria-label={`Move ${button.direction}`}
            {...bindPointerHandlers(button.direction)}
          >
            {button.label}
          </button>
        ))}
        <div className="mobile-controls__center" aria-hidden="true">
          <span>FLY</span>
          <small>hold</small>
        </div>
      </div>
    </div>
  );
}
