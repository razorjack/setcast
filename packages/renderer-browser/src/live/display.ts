import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@setcast/core';

interface Display extends Screen {
  left: number;
  top: number;
  label: string;
}
interface Displays extends EventTarget {
  screens: Display[];
}
type DisplayWindow = Window & { getScreenDetails?: () => Promise<Displays> };
type DisplayChoice = Pick<Display, 'label' | 'width' | 'height'> & { key: string };
const screenKey = (screen: Display) =>
  `${screen.label}:${screen.left}:${screen.top}:${screen.width}:${screen.height}`;

export function useOutputDisplay(report: (message: string) => void, cleanOutput: () => void) {
  const displays = useDisplays(report);
  const fullscreen = useFullscreen(report, cleanOutput, () => {
    if (!displays.selected) return undefined;
    const screen = displays.details?.screens.find(
      (screen) => screenKey(screen) === displays.selected,
    );
    if (!screen)
      throw new Error('The selected display is unavailable. Find displays and select it again.');
    return screen;
  });
  return { ...displays, ...fullscreen };
}

function useDisplays(report: (message: string) => void) {
  const [details, setDetails] = useState<Displays | null>(null);
  const [screens, setScreens] = useState<DisplayChoice[]>([]);
  const [selected, select] = useState('');
  const supported = typeof (window as DisplayWindow).getScreenDetails === 'function';
  useEffect(() => {
    if (!details) return;
    const changed = () => {
      setScreens(
        details.screens.map((screen) => ({
          key: screenKey(screen),
          label: screen.label,
          width: screen.width,
          height: screen.height,
        })),
      );
      if (selected && !details.screens.some((screen) => screenKey(screen) === selected)) {
        select('');
        report(
          'The selected output display disconnected or changed. Find displays and choose an output again.',
        );
      }
    };
    changed();
    details.addEventListener('screenschange', changed);
    details.addEventListener('currentscreenchange', changed);
    return () => {
      details.removeEventListener('screenschange', changed);
      details.removeEventListener('currentscreenchange', changed);
    };
  }, [details, selected, report]);
  const discover = async () => {
    try {
      setDetails(await (window as DisplayWindow).getScreenDetails!());
    } catch (error) {
      report(
        `Cannot list displays: ${errorMessage(error)}. Allow window-management access, or move the output window manually.`,
      );
    }
  };
  return { details, screens, selected, select, supported, discover };
}

function useFullscreen(
  report: (message: string) => void,
  cleanOutput: () => void,
  selected: () => Display | undefined,
) {
  const [active, setActive] = useState(Boolean(document.fullscreenElement));
  const expected = useRef(false);
  useEffect(() => {
    const changed = () => {
      const fullscreen = Boolean(document.fullscreenElement);
      setActive(fullscreen);
      if (expected.current && !fullscreen)
        report('Output left fullscreen. Use Restore fullscreen in Output setup.');
      expected.current = fullscreen;
    };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, [report]);
  const enter = async () => {
    try {
      const options: FullscreenOptions & { screen?: Display } = { navigationUI: 'hide' };
      const screen = selected();
      if (screen) options.screen = screen;
      cleanOutput();
      await document.documentElement.requestFullscreen(options);
      expected.current = true;
      setActive(true);
    } catch (error) {
      report(
        `Fullscreen was refused: ${errorMessage(error)}. Focus the output window and press F to retry.`,
      );
    }
  };
  const toggle = async () => {
    if (!document.fullscreenElement) return enter();
    expected.current = false;
    try {
      await document.exitFullscreen();
    } catch (error) {
      report(`Cannot leave fullscreen: ${String(error)}. Press Esc in the output window.`);
    }
  };
  return { active, enter, toggle };
}
