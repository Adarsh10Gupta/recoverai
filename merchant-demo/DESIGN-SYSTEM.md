# RecoverAI v4 design system

The interface is intentionally restrained rather than gradient-heavy. It uses a neutral fintech canvas, deep ink navigation, blue as the interaction color, green for healthy/recovered states, amber for attention and red for failures.

Typography uses a strong sans family for product UI and a mono family for IDs and operational data. Motion is implemented with the Motion package (the current Framer Motion ecosystem) using `animate` and `inView`, with a reduced-motion media query.

The desktop navigation is a normal product sidebar rather than a floating capsule. The mobile version becomes a drawer. Dashboard sections use progressive disclosure and operational hierarchy instead of decorative cards.
