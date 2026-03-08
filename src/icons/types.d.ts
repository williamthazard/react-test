// types.d.ts
// TypeScript declarations for ion-icon web component in React/JSX
import 'react';

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'ion-icon': React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement> & {
                    name: string;
                    size?: 'small' | 'large';
                },
                HTMLElement
            >;
        }
    }
}
