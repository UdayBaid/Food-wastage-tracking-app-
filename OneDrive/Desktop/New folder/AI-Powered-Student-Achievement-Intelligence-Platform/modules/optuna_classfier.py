import optuna
from xgboost import XGBClassifier
from sklearn.metrics import f1_score
def classifier(X_train_processed, Y_train_risk, X_test_processed, Y_test_risk):
    
    def objective(trial):

        params = {
            "objective": "multi:softmax",
            "num_class": 3,
            "n_estimators": trial.suggest_int("n_estimators", 100, 800),
            "learning_rate": trial.suggest_float(
                "learning_rate", 0.01, 0.2, log=True
            ),
            "max_depth": trial.suggest_int("max_depth", 3, 10),
            "min_child_weight": trial.suggest_int(
                "min_child_weight", 1, 10
            ),
            "subsample": trial.suggest_float(
                "subsample", 0.6, 1.0
            ),
            "colsample_bytree": trial.suggest_float(
                "colsample_bytree", 0.6, 1.0
            ),
            "gamma": trial.suggest_float("gamma", 0, 5),
            "reg_alpha": trial.suggest_float("reg_alpha", 0, 2),
            "reg_lambda": trial.suggest_float(
                "reg_lambda", 0.1, 5
            ),
            "random_state": 42
        }

        model = XGBClassifier(**params)

        model.fit(X_train_processed, Y_train_risk)

        predictions = model.predict(X_test_processed)

        macro_f1 = f1_score(
            Y_test_risk,
            predictions,
            average="macro"
        )

        return macro_f1

    study = optuna.create_study(direction="maximize")

    study.optimize(
        objective,
        n_trials=50
    )

    best_params = study.best_params

    best_model = XGBClassifier(
        **best_params,
        objective="multi:softmax",
        num_class=3,
        random_state=42
    )

    best_model.fit(
        X_train_processed,
        Y_train_risk
    )

    Y_pred_risk = best_model.predict(
        X_test_processed
    )

    macro_f1 = f1_score(
        Y_test_risk,
        Y_pred_risk,
        average="macro"
    )

    print("Best Macro F1:", study.best_value)

    print("\nBest Parameters:")
    print(best_params)

    return best_model, Y_pred_risk, macro_f1