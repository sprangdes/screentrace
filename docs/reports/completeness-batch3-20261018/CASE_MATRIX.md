# 41 個操作案例

預期在執行前由來源定義；PASS 僅代表該列斷言通過。

| ID | 專案 | 操作／斷言 | 結果 |
|---|---|---|---|
| C01 | contract-management-system | navigate: a[href="contractList.do"] → list.jsp | PASS |
| C02 | contract-management-system | navigate: a[href="input.jsp"] → input.jsp | PASS |
| C03 | contract-management-system | navigate: input[type=submit],button[type=submit] → result.jsp, input.jsp | PASS |
| C04 | contract-management-system | navigate: a[href="input.jsp"] → input.jsp | PASS |
| C05 | contract-management-system | feedback: button[onclick]；['登録されています', '登録可能', '通信エラー'] | FAIL |
| C06 | contract-management-system | attribute: [name=contractorName]；contractorNameField | FAIL |
| C07 | contract-management-system | confirmation: a[href*="contractDelete"] | FAIL |
| B01 | Fintech-Finance-Banking-Application | navigate: a[href="/register"] → register.jsp | PASS |
| B02 | Fintech-Finance-Banking-Application | navigate: a[href="/login"] → login.jsp | PASS |
| B03 | Fintech-Finance-Banking-Application | navigate: a[href="/"] → index.jsp | PASS |
| B04 | Fintech-Finance-Banking-Application | navigate: button → login.jsp, error.jsp, dashboard.jsp | PASS |
| B05 | Fintech-Finance-Banking-Application | navigate: a[href="/app/payment_history"] → paymentHistory.jsp | FAIL |
| B06 | Fintech-Finance-Banking-Application | reveal: button#add-account-btn；#offcanvasRight | FAIL |
| B07 | Fintech-Finance-Banking-Application | reveal: button#transact-btn；#offcanvasExample | FAIL |
| B08 | Fintech-Finance-Banking-Application | selectReveal: #transact-type；deposit | FAIL |
| B09 | Fintech-Finance-Banking-Application | feedback: button；['passwords do not match'] | FAIL |
| I01 | SpringMVC-IMS | navigate: a[href="loginform"] → loginform.jsp | PASS |
| I02 | SpringMVC-IMS | navigate: #loginBtn → dashboard.jsp, loginform.jsp | FAIL |
| I03 | SpringMVC-IMS | navigate: a[href="dashboard"] → dashboard.jsp, loginform.jsp | FAIL |
| I04 | SpringMVC-IMS | navigate: a[href="customers"] → customers.jsp, loginform.jsp | FAIL |
| I05 | SpringMVC-IMS | navigate: a[href="suppliers"] → suppliers.jsp, loginform.jsp | FAIL |
| I06 | SpringMVC-IMS | navigate: a[href="brand"] → brand.jsp, loginform.jsp | FAIL |
| I07 | SpringMVC-IMS | navigate: a[href="category"] → category.jsp, loginform.jsp | FAIL |
| I08 | SpringMVC-IMS | navigate: a[href="model"] → model.jsp, loginform.jsp | FAIL |
| I09 | SpringMVC-IMS | navigate: a[href="product"] → product.jsp, loginform.jsp | FAIL |
| I10 | SpringMVC-IMS | reveal: button[title="Insert New Category"]；#insertCategoryModal | FAIL |
| I11 | SpringMVC-IMS | request: #searchCategory；searchCategory | FAIL |
| I12 | SpringMVC-IMS | reveal: a[title="Edit"]；#editCategoryPopUp | FAIL |
| I13 | SpringMVC-IMS | reveal: a[title="Delete"]；#deleteCategoryPopUp | FAIL |
| A01 | airline_system | navigate: a[href="/flights"] → flights.html | PASS |
| A02 | airline_system | navigate: a[href="/passengers"] → passengers.html | PASS |
| A03 | airline_system | navigate: a[href="/reservations"] → reservations.html | PASS |
| A04 | airline_system | navigate: a[href="/"] → index.html | PASS |
| A05 | airline_system | attribute: #passengerId；passengerId | FAIL |
| A06 | airline_system | attribute: #firstName；firstName | FAIL |
| A07 | airline_system | attribute: #lastName；lastName | FAIL |
| A08 | airline_system | attribute: #flightNumber；flightNumber | FAIL |
| A09 | airline_system | attribute: #seatCapacity；seatCapacity | FAIL |
| A10 | airline_system | record: button[type=submit] → passengers.html；['ST-BATCH3', 'ScreenTrace', 'Completeness'] | FAIL |
| A11 | airline_system | record: button[type=submit] → flights.html；['ST-318', 'Taipei', 'Tokyo'] | FAIL |
| A12 | airline_system | options: select[name=flightNumber] | PASS |
