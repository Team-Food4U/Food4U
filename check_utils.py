import utils, utils.db as d
print("utils module path:", getattr(utils, "__file__", "(namespace)"))
print("db module path:", d.__file__)
print("has upsert_location:", hasattr(d, "upsert_location"))
print("has insert_menu_items:", hasattr(d, "insert_menu_items"))
