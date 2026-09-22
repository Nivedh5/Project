"""
The seeded dataset — every row spelled out, nothing generated at run time.

Plain data: no imports, no randomness, no weights. Edit a row here and that is
exactly what a fresh database contains.

Times are offsets in hours rather than fixed dates, so the data reads as
current whenever the app is first started. Two outstanding requests sit inside
the 24-hour reminder hold; no review is ever completed in the future.

Each row is:
    (name, email, star_rating, requested_hours_ago, completed_days_after,
     status, mail_status)

`star_rating` is in half-point steps (1.0 to 5.0). It, and
`completed_days_after`, are None while a request is still out.
"""

# Still waiting on the customer. The first two are inside the 24-hour hold, so
# a fresh database shows the reminder rule straight away, and the three mail
# outcomes are all represented. The remaining ten are immediately remindable,
# which is what the notification badge counts and what "Reset data" restores.
PENDING_ROWS = [
    ('Kaitlyn Brooks', 'kaitlyn.brooks@gmail.com', None, 17, None, 'Review Requested', 'Bounced'),
    ('Nathan Ellsworth', 'nathan.ellsworth@aol.com', None, 3, None, 'Review Requested', 'Opened'),
    ('Liam Donovan', 'liam.donovan@outlook.com', None, 1816, None, 'Review Requested', 'Not Opened'),
    ('Rachel Lindqvist', 'rachel.lindqvist@gmail.com', None, 812, None, 'Review Requested', 'Not Opened'),
    ('Divya Menon', 'divya.menon@gmail.com', None, 353, None, 'Review Requested', 'Opened'),
    ('Amanda Reyes', 'amanda.reyes@gmail.com', None, 891, None, 'Review Requested', 'Bounced'),
    ('Ximena Delgado', 'ximena.delgado@gmail.com', None, 1660, None, 'Review Requested', 'Not Opened'),
    ('Olivia Tran', 'olivia.tran@gmail.com', None, 923, None, 'Review Requested', 'Not Opened'),
    ('Bianca Rossi', 'bianca.rossi@gmail.com', None, 860, None, 'Review Requested', 'Opened'),
    ('Yusuf Kaplan', 'yusuf.kaplan@yahoo.com', None, 2149, None, 'Review Requested', 'Opened'),
    ('Wesley Barrington', 'wesley.barrington@comcast.net', None, 608, None, 'Review Requested', 'Opened'),
    ('Teresa Villalobos', 'teresa.villalobos@gmail.com', None, 1095, None, 'Review Requested', 'Opened'),
]

# Reviews that came back. Those whose mail is "Not Opened" are the customers
# who reviewed somewhere else, which is what the UI flags as
# "reviewed elsewhere".
COMPLETED_ROWS = [
    ('Zoe Fitzgerald', 'zoe.fitzgerald@gmail.com', 5.0, 1742, 9, 'Completed', 'Opened'),
    ('Irene Kowalski', 'irene.kowalski@gmail.com', 3.5, 637, 5, 'Completed', 'Opened'),
    ('Priya Raghunathan', 'priya.raghunathan@gmail.com', 4.5, 1451, 8, 'Completed', 'Opened'),
    ('Samuel Adeyemi', 'samuel.adeyemi@outlook.com', 1.0, 1506, 12, 'Completed', 'Not Opened'),
    ('Hassan Al-Amin', 'hassan.alamin@icloud.com', 4.0, 659, 11, 'Completed', 'Opened'),
    ('Vanessa Cho', 'vanessa.cho@gmail.com', 5.0, 1576, 4, 'Completed', 'Not Opened'),
    ('Jamal Prescott', 'jamal.prescott@yahoo.com', 2.5, 1123, 8, 'Completed', 'Not Opened'),
    ('Umar Farooq', 'umar.farooq@icloud.com', 4.5, 89, 3, 'Completed', 'Opened'),
    ('Colin Fairbanks', 'colin.fairbanks@yahoo.com', 3.0, 260, 3, 'Completed', 'Opened'),
    ('Brian Okafor', 'b.okafor@outlook.com', 5.0, 1447, 1, 'Completed', 'Opened'),
    ('Fiona Gallagher', 'fiona.gallagher@gmail.com', 1.5, 548, 5, 'Completed', 'Opened'),
    ('Aaron Mbeki', 'aaron.mbeki@outlook.com', 4.0, 1172, 1, 'Completed', 'Opened'),
    ('Frank DiMaggio', 'frank.dimaggio@comcast.net', 5.0, 200, 6, 'Completed', 'Opened'),
    ('Hana Yamamoto', 'hana.yamamoto@gmail.com', 2.0, 1356, 11, 'Completed', 'Opened'),
    ('Maria Castellanos', 'maria.castellanos@gmail.com', 4.5, 2114, 1, 'Completed', 'Not Opened'),
    ('Derek Salinas', 'derek.salinas@gmail.com', 3.5, 833, 4, 'Completed', 'Opened'),
    ('Julia Bergstrom', 'julia.bergstrom@gmail.com', 5.0, 1246, 12, 'Completed', 'Opened'),
    ('Grace Whitfield', 'grace.whitfield@gmail.com', 4.0, 1427, 2, 'Completed', 'Opened'),
    ('Quentin Boyle', 'quentin.boyle@yahoo.com', 1.0, 775, 9, 'Completed', 'Opened'),
    ('Gregory Sandoval', 'gregory.sandoval@outlook.com', 4.5, 988, 7, 'Completed', 'Not Opened'),
    ('Elena Petrova', 'elena.petrova@protonmail.com', 3.0, 1922, 12, 'Completed', 'Opened'),
    ('Carla Nguyen', 'carla.nguyen@yahoo.com', 5.0, 891, 4, 'Completed', 'Not Opened'),
    ('Isaac Rosenthal', 'isaac.rosenthal@yahoo.com', 2.5, 430, 3, 'Completed', 'Opened'),
    ('Eduardo Marquez', 'eduardo.marquez@icloud.com', 4.0, 2127, 11, 'Completed', 'Not Opened'),
]

SEED_ROWS = PENDING_ROWS + COMPLETED_ROWS
