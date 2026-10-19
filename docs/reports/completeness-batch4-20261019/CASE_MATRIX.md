# 第四批逐案結果

| 案例 | 結果 | 來源畫面 | 操作 | 實際觀察 |
|---|---|---|---|---|
| S01 | PASS | tile:tiles.logon | form button[type=submit] | 來源預期通過 |
| S02 | PASS | tile:tiles.dashboard | a[href="/spotify-pagination.do"] | 來源預期通過 |
| S03 | FAIL | tile:tiles.spotify.list.pagination | a[href="/spotify-init.do?action=create"] | Error: CONTROL_NOT_VISIBLE: a[href="/spotify-init.do?action=create"] |
| S04 | PASS | tile:tiles.spotify.init | a[href="/spotify-pagination.do"] | 來源預期通過 |
| S05 | FAIL | tile:tiles.dashboard | #sidebarToggle | CLASS_NOT_TOGGLED |
| S06 | FAIL | tile:tiles.dashboard | #navbarDropdown | Error: CONTROL_NOT_VISIBLE: #navbarDropdown |
| S07 | FAIL | tile:tiles.spotify.init | form | FORM_REQUEST_BRANCHES_INCOMPLETE |
| S08 | FAIL | tile:tiles.spotify.list.pagination | a[href*="action=edit"] | Error: CONTROL_NOT_VISIBLE: a[href*="action=edit"] |
| S09 | FAIL | tile:tiles.spotify.init | form button[type=submit] | DESTINATION_SET_MISMATCH, EXPECTED_BRANCH_NOT_REACHABLE, SUBMITTED_VALUES_NOT_RENDERED |
| L01 | FAIL | file:src/main/webapp/login.jsp | a[href="Register"] | DESTINATION_SET_MISMATCH, EXPECTED_BRANCH_NOT_REACHABLE |
| L02 | FAIL | file:src/main/webapp/register.jsp | input[type=submit] | DESTINATION_SET_MISMATCH, EXPECTED_BRANCH_NOT_REACHABLE |
| L03 | FAIL | file:src/main/webapp/login.jsp | input[type=submit] | DESTINATION_SET_MISMATCH, EXPECTED_BRANCH_NOT_REACHABLE |
| L04 | FAIL | file:src/main/webapp/bookListing.jsp | form[action=Add] button | DESTINATION_SET_MISMATCH, EXPECTED_BRANCH_NOT_REACHABLE |
| L05 | FAIL | file:src/main/webapp/bookListing.jsp | form[action=Edit] button | DESTINATION_SET_MISMATCH, EXPECTED_BRANCH_NOT_REACHABLE |
| L06 | FAIL | file:src/main/webapp/AddBook.jsp | form[action=Addbook] button | DESTINATION_SET_MISMATCH, EXPECTED_BRANCH_NOT_REACHABLE |
| L07 | FAIL | file:src/main/webapp/AddBook.jsp | #bookCode | SOURCE_KEYPRESS_VALIDATION_NOT_REPLAYED |
| L08 | FAIL | file:src/main/webapp/AddBook.jsp | form[action=Addbook] button | DESTINATION_SET_MISMATCH, EXPECTED_BRANCH_NOT_REACHABLE, SUBMITTED_VALUES_NOT_RENDERED |
| L09 | FAIL | file:src/main/webapp/bookListing.jsp | form[action=Delete] button | DESTINATION_SET_MISMATCH |
| L10 | FAIL | file:src/main/webapp/bookListing.jsp | form[action=Logout] input | DESTINATION_SET_MISMATCH, EXPECTED_BRANCH_NOT_REACHABLE |
| H01 | PASS | file:src/main/resources/templates/visitor/home.html | a[href="/admin/login"] | 來源預期通過 |
| H02 | PASS | file:src/main/resources/templates/admin/login.html | button[type=submit] | 來源預期通過 |
| H03 | FAIL | file:src/main/resources/templates/admin/login.html | .alert-error | SOURCE_CONDITION_NOT_APPLIED |
| H04 | PASS | file:src/main/resources/templates/admin/dashboard.html | a[href="/admin/rooms"] | 來源預期通過 |
| H05 | PASS | file:src/main/resources/templates/admin/rooms.html | a[href="/admin/rooms/add"] | 來源預期通過 |
| H06 | PASS | file:src/main/resources/templates/admin/room-form.html | #roomNumber | 來源預期通過 |
| H07 | FAIL | file:src/main/resources/templates/admin/room-form.html | form | FORM_REQUEST_BRANCHES_INCOMPLETE |
| H08 | FAIL | file:src/main/resources/templates/admin/rooms.html | a[onclick] | Error: CONFIRMATION_NOT_OPEN |
| H09 | FAIL | file:src/main/resources/templates/visitor/home.html | a.book-btn | DESTINATION_SET_MISMATCH, EXPECTED_BRANCH_NOT_REACHABLE |
| H10 | PASS | file:src/main/resources/templates/visitor/booking-form.html | button[type=submit] | 來源預期通過 |
| H11 | FAIL（原預期有誤，排除有效成績） | file:src/main/resources/templates/visitor/booking-form.html | button[type=submit] | SUBMITTED_VALUES_NOT_RENDERED |
| H12 | PASS | file:src/main/resources/templates/admin/dashboard.html | a[href="/admin/logout"] | 來源預期通過 |

H11 的格式／既有旅客姓名預期限制見 source-expectation-review.json；正確電話及 dd-MM-yyyy 補驗為 X03。

## 來源正確的補充檢查

| 案例 | 結果 | 預期 |
|---|---|---|
| X01 | FAIL | 本機 Home.css 的背景及字型 |
| X02 | FAIL | 入住日 2026-11-01 後退房 min=2026-11-02 |
| X03 | FAIL | 確認頁保留電話 0700419419，日期顯示 01-11-2026、03-11-2026 |

有效檢查共 33 個：原 31 個排除 H11，加上 X01–X03，10 PASS／23 FAIL。原始 31 個結果檔不修改。
