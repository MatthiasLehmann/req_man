/**
 * AUTOMATISCH GENERIERT – nicht von Hand ändern.
 * Quelle: OpenAPI-Schema des Backends, erzeugt mit `npm run generate:api`.
 */

export interface paths {
    "/api/ai-quality/profiles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Verfügbare Qualitätsprofile auflisten
         * @description Gibt alle verfügbaren Qualitätsprofile zurück.
         */
        get: operations["list_profiles_api_ai_quality_profiles_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ai-quality/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * KI-Qualitäts-Einstellungen und API-Key-Status
         * @description Gibt den aktuellen Konfigurations-Status zurück.
         */
        get: operations["get_settings_api_ai_quality_settings_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/attributes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Attributes */
        get: operations["get_attributes_api_attributes_get"];
        /** Update Attributes */
        put: operations["update_attributes_api_attributes_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Me */
        get: operations["get_me_api_auth_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login */
        post: operations["login_api_auth_token_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/document-types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Document Types */
        get: operations["list_document_types_api_document_types_get"];
        put?: never;
        /** Create Document Type */
        post: operations["create_document_type_api_document_types_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/document-types/{type_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Update Document Type */
        put: operations["update_document_type_api_document_types__type_id__put"];
        post?: never;
        /** Delete Document Type */
        delete: operations["delete_document_type_api_document_types__type_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/filesystem/browse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Browse Directory */
        get: operations["browse_directory_api_filesystem_browse_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/localfile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Serve Local File
         * @description Liefert eine lokale Bilddatei direkt vom Originalort.
         *
         *     Response-Header:
         *       X-File-Status: ok | changed | missing | forbidden
         *       X-File-Hash:   aktueller SHA256
         */
        get: operations["serve_local_file_api_localfile_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/localfile/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Check Local Files
         * @description Prüft mehrere Pfad+Hash-Paare auf einmal.
         *     Gibt für jeden Eintrag: {path, status: ok|changed|missing|forbidden, current_hash?}
         */
        post: operations["check_local_files_api_localfile_check_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/localfile/pick": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Pick Local File
         * @description Öffnet nativen Dateidialog. Gibt Pfad, Hash, Größe und Name zurück.
         */
        post: operations["pick_local_file_api_localfile_pick_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/plantuml/render": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Render Plantuml
         * @description Rendert PlantUML-Quelltext zu SVG.
         *
         *     Verwendet Java + plantuml.jar lokal – kein Internet erforderlich (nach
         *     dem einmaligen Download der JAR-Datei).
         */
        post: operations["render_plantuml_api_plantuml_render_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Projects */
        get: operations["list_projects_api_projects_get"];
        put?: never;
        /** Create Project */
        post: operations["create_project_api_projects_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import Project
         * @description Importiert ein bestehendes Doorstop-Projekt aus einem Dateisystempfad.
         */
        post: operations["import_project_api_projects_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Project */
        get: operations["get_project_api_projects__project_id__get"];
        put?: never;
        post?: never;
        /**
         * Delete Project
         * @description Entfernt ein Projekt aus der Registry.
         *     Mit ?delete_files=true wird das Verzeichnis physisch gelöscht.
         */
        delete: operations["delete_project_api_projects__project_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/documents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Documents */
        get: operations["list_documents_api_projects__project_id__documents_get"];
        put?: never;
        /** Create Document */
        post: operations["create_document_api_projects__project_id__documents_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/documents/{prefix}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Document */
        delete: operations["delete_document_api_projects__project_id__documents__prefix__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/documents/{prefix}/ai-quality-batch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Batch-Analyse aller Anforderungen in einem Dokument
         * @description Startet die KI-Analyse aller Anforderungen in einem Dokument als
         *     Hintergrundaufgabe. Gibt sofort zurück mit der Anzahl geplanter Analysen.
         */
        post: operations["trigger_batch_ai_quality_api_projects__project_id__documents__prefix__ai_quality_batch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/documents/{prefix}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Export Document
         * @description Exportiert ein einzelnes Dokument als Tabelle.
         */
        get: operations["export_document_api_projects__project_id__documents__prefix__export_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/documents/{prefix}/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Items */
        get: operations["list_items_api_projects__project_id__documents__prefix__items_get"];
        put?: never;
        /** Create Item */
        post: operations["create_item_api_projects__project_id__documents__prefix__items_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/documents/{prefix}/properties": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Update Document Properties */
        put: operations["update_document_properties_api_projects__project_id__documents__prefix__properties_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/documents/{prefix}/type": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Assign Document Type */
        put: operations["assign_document_type_api_projects__project_id__documents__prefix__type_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Export Project
         * @description Exportiert alle Dokumente des Projekts als ZIP-Archiv.
         */
        get: operations["export_project_api_projects__project_id__export_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/git/log": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Git Log
         * @description Gibt die letzten Commits des Projekt-Git-Repos zurück.
         */
        get: operations["get_git_log_api_projects__project_id__git_log_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/git/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Git Status
         * @description Gibt zurück ob das Projekt ein Git-Repo hat.
         */
        get: operations["get_git_status_api_projects__project_id__git_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Item */
        get: operations["get_item_api_projects__project_id__items__uid__get"];
        /** Update Item */
        put: operations["update_item_api_projects__project_id__items__uid__put"];
        post?: never;
        /** Delete Item */
        delete: operations["delete_item_api_projects__project_id__items__uid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/ai-quality": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Letztes gespeichertes KI-Qualitätsergebnis abrufen
         * @description Gibt das zuletzt gespeicherte KI-Qualitätsergebnis für eine Anforderung zurück.
         *     Gibt null zurück wenn noch keine Analyse durchgeführt wurde.
         */
        get: operations["get_ai_quality_api_projects__project_id__items__uid__ai_quality_get"];
        put?: never;
        /**
         * KI-Qualitätsprüfung für eine Anforderung anstoßen
         * @description Analysiert eine Anforderung mit Claude und speichert das Ergebnis als
         *     Sidecar-YAML (`<uid>.ai-quality.yml`) neben der Anforderungsdatei.
         *
         *     Gibt HTTP 503 zurück wenn ANTHROPIC_API_KEY nicht gesetzt ist.
         *     Gibt HTTP 422 zurück bei header=True oder zu kurzem Text.
         */
        post: operations["trigger_ai_quality_api_projects__project_id__items__uid__ai_quality_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/commits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Item Commits
         * @description Alle Git-Commits, deren Message die Anforderungs-UID referenziert.
         */
        get: operations["get_item_commits_api_projects__project_id__items__uid__commits_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/links": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add Link */
        post: operations["add_link_api_projects__project_id__items__uid__links_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/links/{target_uid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Remove Link */
        delete: operations["remove_link_api_projects__project_id__items__uid__links__target_uid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/references": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get References
         * @description Gibt die gespeicherten Referenzen zurück (keine Hash-Prüfung).
         */
        get: operations["get_references_api_projects__project_id__items__uid__references_get"];
        /**
         * Update References
         * @description Speichert die Referenz-Liste. SHA256 wird für alle Dateien neu berechnet
         *     (sofern die Datei am angegebenen Pfad existiert).
         */
        put: operations["update_references_api_projects__project_id__items__uid__references_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/references/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Check References
         * @description Prüft den SHA256-Status aller gespeicherten Referenzen.
         *     Status: 'ok' | 'changed' | 'missing' | 'no_hash'
         */
        post: operations["check_references_api_projects__project_id__items__uid__references_check_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/references/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Refresh Reference Hashes
         * @description Berechnet SHA256 aller Referenzen neu und speichert das Ergebnis.
         *     Nützlich wenn Dateien bewusst geändert wurden und der Hash aktualisiert
         *     werden soll.
         */
        post: operations["refresh_reference_hashes_api_projects__project_id__items__uid__references_refresh_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Review Item
         * @description Stempelt ein Item mit dem aktuellen Inhalts-Hash (doorstop review).
         *     Setzt reviewed = SHA256(uid + text + ref + links).
         *     Erfordert Editor-Rolle.
         */
        post: operations["review_item_api_projects__project_id__items__uid__review_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/simulink-links": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Simulink-Links einer Anforderung abrufen */
        get: operations["get_item_simulink_links_api_projects__project_id__items__uid__simulink_links_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Validation
         * @description Erstellt einen Validierungsreport und committet ihn in Git.
         */
        post: operations["create_validation_api_projects__project_id__items__uid__validate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/validations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Validations
         * @description Gibt alle Validierungsreports eines Items zurück (neueste zuerst).
         */
        get: operations["list_validations_api_projects__project_id__items__uid__validations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/items/{uid}/validations/latest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Latest Validation
         * @description Gibt den aktuellen Validierungsstatus eines Items zurück.
         */
        get: operations["get_latest_validation_api_projects__project_id__items__uid__validations_latest_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Metrics */
        get: operations["get_metrics_api_projects__project_id__metrics_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/simulink/coverage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Simulink-Coverage-Statistik abrufen
         * @description Gibt zurück wie viele Anforderungen durch mindestens einen Simulink-Block abgedeckt sind.
         */
        get: operations["get_simulink_coverage_api_projects__project_id__simulink_coverage_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/simulink/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Simulink-Traceability-JSON importieren
         * @description Importiert eine simulink_trace.json-Datei (erzeugt durch export_simulink_trace.m). Verknüpfungen werden als Sidecar-YAMLs neben den Anforderungsdateien gespeichert. Bestehende Links für das jeweilige Modell werden überschrieben.
         */
        post: operations["import_simulink_api_projects__project_id__simulink_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/simulink/links": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Alle Simulink-Links des Projekts löschen */
        delete: operations["delete_simulink_links_api_projects__project_id__simulink_links_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/structure": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Project Structure */
        get: operations["get_project_structure_api_projects__project_id__structure_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/traceability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Traceability */
        get: operations["get_traceability_api_projects__project_id__traceability_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{project_id}/validations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List All Validations
         * @description Gibt alle Validierungsreports des Projekts zurück.
         */
        get: operations["list_all_validations_api_projects__project_id__validations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/uploads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Upload Image
         * @description Upload a local image file and return its server URL.
         */
        post: operations["upload_image_api_uploads_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Users */
        get: operations["list_users_api_users_get"];
        put?: never;
        /** Create User */
        post: operations["create_user_api_users_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get User */
        get: operations["get_user_api_users__user_id__get"];
        /** Update User */
        put: operations["update_user_api_users__user_id__put"];
        post?: never;
        /** Delete User */
        delete: operations["delete_user_api_users__user_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AiQualityIssue */
        AiQualityIssue: {
            /** Category */
            category: string;
            /** Description */
            description: string;
            /** Severity */
            severity: string;
            /** Suggestion */
            suggestion: string;
        };
        /** AiQualityRequest */
        AiQualityRequest: {
            /** Model */
            model?: string | null;
            /**
             * Profile
             * @default standard
             */
            profile?: string;
        };
        /** AiQualityResult */
        AiQualityResult: {
            /** Issues */
            issues: components["schemas"]["AiQualityIssue"][];
            /** Model Used */
            model_used: string;
            /** Profile Used */
            profile_used: string;
            /** Requirement Uid */
            requirement_uid: string;
            score: components["schemas"]["AiQualityScore"];
            /** Summary */
            summary: string;
            /** Timestamp */
            timestamp: string;
        };
        /** AiQualityScore */
        AiQualityScore: {
            /** Clarity */
            clarity: number | null;
            /** Completeness */
            completeness: number | null;
            /** Consistency */
            consistency: number | null;
            /** Overall */
            overall: number;
            /** Testability */
            testability: number | null;
        };
        /** AssignDocumentTypeRequest */
        AssignDocumentTypeRequest: {
            /** Document Type Id */
            document_type_id?: string | null;
        };
        /** AttributeDefinition */
        "AttributeDefinition-Input": {
            /**
             * Applies To
             * @default []
             */
            applies_to?: string[];
            /** Attr Type */
            attr_type: string;
            /** Default Value */
            default_value?: unknown;
            /** Display Name */
            display_name: string;
            /** Help Text */
            help_text?: string | null;
            /** Key */
            key: string;
            /** Possible Values */
            possible_values?: string[] | null;
            /**
             * Required
             * @default false
             */
            required?: boolean;
        };
        /** AttributeDefinition */
        "AttributeDefinition-Output": {
            /**
             * Applies To
             * @default []
             */
            applies_to: string[];
            /** Attr Type */
            attr_type: string;
            /** Default Value */
            default_value: unknown;
            /** Display Name */
            display_name: string;
            /** Help Text */
            help_text: string | null;
            /** Key */
            key: string;
            /** Possible Values */
            possible_values: string[] | null;
            /**
             * Required
             * @default false
             */
            required: boolean;
        };
        /** Body_import_simulink_api_projects__project_id__simulink_import_post */
        Body_import_simulink_api_projects__project_id__simulink_import_post: {
            /**
             * File
             * @description simulink_trace.json vom MATLAB-Exportskript
             */
            file: string;
        };
        /** Body_login_api_auth_token_post */
        Body_login_api_auth_token_post: {
            /** Client Id */
            client_id?: string | null;
            /**
             * Client Secret
             * Format: password
             */
            client_secret?: string | null;
            /** Grant Type */
            grant_type?: string | null;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Scope
             * @default
             */
            scope?: string;
            /** Username */
            username: string;
        };
        /** Body_upload_image_api_uploads_post */
        Body_upload_image_api_uploads_post: {
            /** File */
            file: string;
        };
        /** BrowseResponse */
        BrowseResponse: {
            /** Current */
            current: string;
            /** Entries */
            entries: components["schemas"]["DirEntry"][];
            /** Parent */
            parent: string | null;
        };
        /** CheckItem */
        CheckItem: {
            /** Hash */
            hash: string;
            /** Path */
            path: string;
        };
        /** ChecklistItem */
        ChecklistItem: {
            /**
             * Applicable
             * @default true
             */
            applicable?: boolean | null;
            /** Coverage Percent */
            coverage_percent?: number | null;
            /**
             * Note
             * @default
             */
            note?: string | null;
            /** Refs */
            refs?: string[] | null;
            /** Review Date */
            review_date?: string | null;
            /** Reviewer Display Name */
            reviewer_display_name?: string | null;
            /** Reviewer Username */
            reviewer_username?: string | null;
            /** Test Run Id */
            test_run_id?: string | null;
            /** Value */
            value: boolean;
        };
        /** CommitInfo */
        CommitInfo: {
            /** Author */
            author: string;
            /** Date */
            date: string;
            /** Hash */
            hash: string;
            /** Hash Short */
            hash_short: string;
            /** Message */
            message: string;
        };
        /** DirEntry */
        DirEntry: {
            /** Is Dir */
            is_dir: boolean;
            /** Name */
            name: string;
            /** Path */
            path: string;
        };
        /** DocumentCreate */
        DocumentCreate: {
            /** Parent */
            parent?: string | null;
            /** Prefix */
            prefix: string;
            /**
             * Sep
             * @default -
             */
            sep?: string | null;
        };
        /** DocumentMetrics */
        DocumentMetrics: {
            /** Active */
            active: number;
            /** Headers */
            headers: number;
            /** Inactive */
            inactive: number;
            /** Linked */
            linked: number;
            /** Non Normative */
            non_normative: number;
            /** Normative */
            normative: number;
            /** Prefix */
            prefix: string;
            /** Reviewed */
            reviewed: number;
            /** Total */
            total: number;
            /** Unlinked */
            unlinked: number;
            /** Unreviewed */
            unreviewed: number;
        };
        /** DocumentPropertiesUpdate */
        DocumentPropertiesUpdate: {
            /**
             * Values
             * @default {}
             */
            values?: {
                [key: string]: string;
            };
        };
        /** DocumentResponse */
        DocumentResponse: {
            /**
             * Children
             * @default []
             */
            children: string[];
            /** Item Count */
            item_count: number;
            /** Parent */
            parent: string | null;
            /** Path */
            path: string;
            /** Prefix */
            prefix: string;
            /** Sep */
            sep: string;
        };
        /** DocumentTypeCreate */
        DocumentTypeCreate: {
            /**
             * Color
             * @default #3b82f6
             */
            color?: string;
            /**
             * Default Prefix
             * @default
             */
            default_prefix?: string;
            /**
             * Description
             * @default
             */
            description?: string;
            /** Name */
            name: string;
            /**
             * Properties
             * @default []
             */
            properties?: components["schemas"]["PropertyDefinition-Input"][];
        };
        /** DocumentTypeResponse */
        DocumentTypeResponse: {
            /** Color */
            color: string;
            /** Default Prefix */
            default_prefix: string;
            /** Description */
            description: string;
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Properties */
            properties: components["schemas"]["PropertyDefinition-Output"][];
        };
        /** DocumentTypeUpdate */
        DocumentTypeUpdate: {
            /** Color */
            color?: string | null;
            /** Default Prefix */
            default_prefix?: string | null;
            /** Description */
            description?: string | null;
            /** Name */
            name?: string | null;
            /** Properties */
            properties?: components["schemas"]["PropertyDefinition-Input"][] | null;
        };
        /** DocumentWithType */
        DocumentWithType: {
            /**
             * Children
             * @default []
             */
            children: string[];
            document_type: components["schemas"]["DocumentTypeResponse"] | null;
            /** Document Type Id */
            document_type_id: string | null;
            /** Item Count */
            item_count: number;
            /** Parent */
            parent: string | null;
            /** Path */
            path: string;
            /** Prefix */
            prefix: string;
            /**
             * Property Values
             * @default {}
             */
            property_values: {
                [key: string]: string;
            };
            /** Sep */
            sep: string;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** ItemCreate */
        ItemCreate: {
            /**
             * Active
             * @default true
             */
            active?: boolean | null;
            /**
             * Custom Attributes
             * @default {}
             */
            custom_attributes?: {
                [key: string]: unknown;
            } | null;
            /**
             * Header
             * @default false
             */
            header?: boolean | null;
            /** Level */
            level?: string | null;
            /**
             * Links
             * @default []
             */
            links?: string[] | null;
            /**
             * Normative
             * @default true
             */
            normative?: boolean | null;
            /**
             * Text
             * @default
             */
            text?: string | null;
        };
        /** ItemResponse */
        ItemResponse: {
            /** Active */
            active: boolean;
            /**
             * Custom Attributes
             * @default {}
             */
            custom_attributes: {
                [key: string]: unknown;
            };
            /** Derived */
            derived: boolean;
            /** Header */
            header: boolean;
            /** Level */
            level: string;
            /** Links */
            links: string[];
            /** Normative */
            normative: boolean;
            /**
             * References
             * @default []
             */
            references: {
                [key: string]: unknown;
            }[];
            /** Reviewed */
            reviewed: string | null;
            /** Reviewed Current */
            reviewed_current: boolean | null;
            /** Text */
            text: string;
            /** Uid */
            uid: string;
        };
        /** ItemUpdate */
        ItemUpdate: {
            /** Active */
            active?: boolean | null;
            /** Custom Attributes */
            custom_attributes?: {
                [key: string]: unknown;
            } | null;
            /** Derived */
            derived?: boolean | null;
            /** Header */
            header?: boolean | null;
            /** Level */
            level?: string | null;
            /** Links */
            links?: string[] | null;
            /** Normative */
            normative?: boolean | null;
            /** Text */
            text?: string | null;
        };
        /** LinkCreate */
        LinkCreate: {
            /** Target Uid */
            target_uid: string;
        };
        /** ProjectCreate */
        ProjectCreate: {
            /**
             * Description
             * @default
             */
            description?: string | null;
            /** Name */
            name: string;
            /** Path */
            path: string;
        };
        /** ProjectImport */
        ProjectImport: {
            /**
             * Description
             * @default
             */
            description?: string | null;
            /** Name */
            name?: string | null;
            /** Path */
            path: string;
        };
        /** ProjectMetrics */
        ProjectMetrics: {
            /** Documents */
            documents: components["schemas"]["DocumentMetrics"][];
            /** Link Coverage */
            link_coverage: number;
            /** Review Coverage */
            review_coverage: number;
            /** Total Documents */
            total_documents: number;
            /** Total Items */
            total_items: number;
        };
        /** ProjectResponse */
        ProjectResponse: {
            /** Description */
            description: string;
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Path */
            path: string;
        };
        /** ProjectStructureResponse */
        ProjectStructureResponse: {
            /** Documents */
            documents: components["schemas"]["DocumentWithType"][];
        };
        /** PropertyDefinition */
        "PropertyDefinition-Input": {
            /** Key */
            key: string;
            /** Label */
            label: string;
            /** Options */
            options?: string[] | null;
            /** Type */
            type: string;
        };
        /** PropertyDefinition */
        "PropertyDefinition-Output": {
            /** Key */
            key: string;
            /** Label */
            label: string;
            /** Options */
            options: string[] | null;
            /** Type */
            type: string;
        };
        /** ReferenceIn */
        ReferenceIn: {
            /**
             * Keyword
             * @default
             */
            keyword?: string;
            /** Path */
            path: string;
            /** Sha */
            sha?: string | null;
            /**
             * Type
             * @default file
             */
            type?: string;
        };
        /** ReferenceOut */
        ReferenceOut: {
            /** Keyword */
            keyword: string;
            /** Path */
            path: string;
            /** Sha */
            sha: string | null;
            /** Type */
            type: string;
        };
        /** ReferenceStatusOut */
        ReferenceStatusOut: {
            /** Current Sha */
            current_sha: string | null;
            /** Keyword */
            keyword: string;
            /** Path */
            path: string;
            /** Sha */
            sha: string | null;
            /** Status */
            status: string;
            /** Type */
            type: string;
        };
        /** RenderRequest */
        RenderRequest: {
            /** Source */
            source: string;
        };
        /** RenderResponse */
        RenderResponse: {
            /** Svg */
            svg: string;
        };
        /**
         * SimulinkCoverage
         * @description Coverage-Statistik über alle Anforderungen eines Projekts.
         */
        SimulinkCoverage: {
            /** Coverage Percent */
            coverage_percent: number;
            /** Covered */
            covered: number;
            /** Last Import */
            last_import: string | null;
            /** Model */
            model: string | null;
            /** Not Covered */
            not_covered: number;
            /** Not Covered Uids */
            not_covered_uids: string[];
            /** Total Requirements */
            total_requirements: number;
        };
        /**
         * SimulinkImportResult
         * @description Ergebnis eines Import-Vorgangs.
         */
        SimulinkImportResult: {
            /** Imported */
            imported: number;
            /** Model */
            model: string;
            /** Timestamp */
            timestamp: string;
            /** Unknown Uids */
            unknown_uids: string[];
            /** Updated Requirements */
            updated_requirements: string[];
        };
        /**
         * SimulinkLink
         * @description Ein einzelner Block→Anforderung-Link (Simulink-Block oder MATLAB-.m-Datei).
         */
        SimulinkLink: {
            /** Block Path */
            block_path: string;
            /** Block Type */
            block_type: string;
            /** File */
            file: string | null;
            /** Imported At */
            imported_at: string;
            /** Line */
            line: number | null;
            /**
             * Link Type
             * @default implements
             */
            link_type: string;
            /** Model File */
            model_file: string;
            /**
             * Source Type
             * @default simulink
             */
            source_type: string;
            /** Uid */
            uid: string;
        };
        /**
         * SimulinkSidecar
         * @description Sidecar-YAML pro Anforderung: alle verlinkten Blöcke.
         */
        SimulinkSidecar: {
            /** Last Import */
            last_import: string;
            /**
             * Links
             * @default []
             */
            links: components["schemas"]["SimulinkLink"][];
            /** Model */
            model: string;
            /** Requirement Uid */
            requirement_uid: string;
        };
        /** Token */
        Token: {
            /** Access Token */
            access_token: string;
            /** Token Type */
            token_type: string;
        };
        /** TraceabilityData */
        TraceabilityData: {
            /** Links */
            links: components["schemas"]["TraceabilityLink"][];
            /** Nodes */
            nodes: components["schemas"]["TraceabilityNode"][];
        };
        /** TraceabilityLink */
        TraceabilityLink: {
            /** Source */
            source: string;
            /** Target */
            target: string;
            /** Valid */
            valid: boolean;
        };
        /** TraceabilityNode */
        TraceabilityNode: {
            /** Active */
            active: boolean;
            /** Document */
            document: string;
            /** Level */
            level: string;
            /** Normative */
            normative: boolean;
            /** Text */
            text: string;
            /** Uid */
            uid: string;
        };
        /** UserCreate */
        UserCreate: {
            /** Email */
            email: string;
            /** Full Name */
            full_name: string;
            /** Home Dir */
            home_dir?: string | null;
            /** Password */
            password: string;
            /**
             * Role
             * @default viewer
             */
            role?: string;
            /** Username */
            username: string;
        };
        /** UserResponse */
        UserResponse: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Email */
            email: string;
            /** Full Name */
            full_name: string;
            /** Home Dir */
            home_dir: string | null;
            /** Id */
            id: number;
            /** Is Active */
            is_active: boolean;
            /**
             * Role
             * @default viewer
             */
            role: string;
            /** Username */
            username: string;
        };
        /** UserUpdate */
        UserUpdate: {
            /** Email */
            email?: string | null;
            /** Full Name */
            full_name?: string | null;
            /** Home Dir */
            home_dir?: string | null;
            /** Is Active */
            is_active?: boolean | null;
            /** Password */
            password?: string | null;
            /** Role */
            role?: string | null;
        };
        /** ValidationCreate */
        ValidationCreate: {
            /** Checklist */
            checklist: {
                [key: string]: components["schemas"]["ChecklistItem"];
            };
            /**
             * Skip Doorstop Check
             * @default false
             */
            skip_doorstop_check?: boolean;
            /**
             * Skip Review Stamp
             * @default false
             */
            skip_review_stamp?: boolean;
            /** Status */
            status: string;
            /** Summary */
            summary: string;
        };
        /** ValidationCreateResponse */
        ValidationCreateResponse: {
            /** Commit Hash */
            commit_hash: string;
            /** Commit Hash Short */
            commit_hash_short: string;
            /** Report Path */
            report_path: string;
            /**
             * Review Stamped
             * @default false
             */
            review_stamped: boolean;
            /** Status */
            status: string;
            /** Validation Id */
            validation_id: string;
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
        /**
         * ValidationStatusResponse
         * @description Kompakter Status für die ItemEditor-Anzeige.
         */
        ValidationStatusResponse: {
            /** Commit Hash */
            commit_hash: string | null;
            /**
             * Fingerprint Is Current
             * @default false
             */
            fingerprint_is_current: boolean;
            /** Status */
            status: string | null;
            /** Validation Date */
            validation_date: string | null;
            /** Validation Id */
            validation_id: string | null;
            /** Validator Display Name */
            validator_display_name: string | null;
            /** Validator Username */
            validator_username: string | null;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    list_profiles_api_ai_quality_profiles_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string[];
                };
            };
        };
    };
    get_settings_api_ai_quality_settings_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_attributes_api_attributes_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttributeDefinition-Output"][];
                };
            };
        };
    };
    update_attributes_api_attributes_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AttributeDefinition-Input"][];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_me_api_auth_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserResponse"];
                };
            };
        };
    };
    login_api_auth_token_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": components["schemas"]["Body_login_api_auth_token_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Token"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_document_types_api_document_types_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentTypeResponse"][];
                };
            };
        };
    };
    create_document_type_api_document_types_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DocumentTypeCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentTypeResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_document_type_api_document_types__type_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                type_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DocumentTypeUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentTypeResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_document_type_api_document_types__type_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                type_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    browse_directory_api_filesystem_browse_get: {
        parameters: {
            query?: {
                path?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrowseResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    serve_local_file_api_localfile_get: {
        parameters: {
            query: {
                /** @description Absoluter Dateipfad */
                path: string;
                /** @description Erwarteter SHA256-Hash */
                h?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    check_local_files_api_localfile_check_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CheckItem"][];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    pick_local_file_api_localfile_pick_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    render_plantuml_api_plantuml_render_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RenderRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RenderResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_projects_api_projects_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectResponse"][];
                };
            };
        };
    };
    create_project_api_projects_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProjectCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    import_project_api_projects_import_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProjectImport"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_project_api_projects__project_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_project_api_projects__project_id__delete: {
        parameters: {
            query?: {
                delete_files?: boolean;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_documents_api_projects__project_id__documents_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentResponse"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_document_api_projects__project_id__documents_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DocumentCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_document_api_projects__project_id__documents__prefix__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                prefix: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    trigger_batch_ai_quality_api_projects__project_id__documents__prefix__ai_quality_batch_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                prefix: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["AiQualityRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_document_api_projects__project_id__documents__prefix__export_get: {
        parameters: {
            query?: {
                /** @description csv | tsv | xlsx | yaml */
                format?: string;
            };
            header?: never;
            path: {
                project_id: string;
                prefix: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_items_api_projects__project_id__documents__prefix__items_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                prefix: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemResponse"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_item_api_projects__project_id__documents__prefix__items_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                prefix: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ItemCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_document_properties_api_projects__project_id__documents__prefix__properties_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                prefix: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DocumentPropertiesUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    assign_document_type_api_projects__project_id__documents__prefix__type_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                prefix: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssignDocumentTypeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_project_api_projects__project_id__export_get: {
        parameters: {
            query?: {
                /** @description csv | tsv | xlsx | yaml */
                format?: string;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_git_log_api_projects__project_id__git_log_get: {
        parameters: {
            query?: {
                max_count?: number;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_git_status_api_projects__project_id__git_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_item_api_projects__project_id__items__uid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_item_api_projects__project_id__items__uid__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ItemUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_item_api_projects__project_id__items__uid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_ai_quality_api_projects__project_id__items__uid__ai_quality_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AiQualityResult"] | null;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    trigger_ai_quality_api_projects__project_id__items__uid__ai_quality_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["AiQualityRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AiQualityResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_item_commits_api_projects__project_id__items__uid__commits_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CommitInfo"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_link_api_projects__project_id__items__uid__links_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LinkCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remove_link_api_projects__project_id__items__uid__links__target_uid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
                target_uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_references_api_projects__project_id__items__uid__references_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReferenceOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_references_api_projects__project_id__items__uid__references_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReferenceIn"][];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReferenceOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    check_references_api_projects__project_id__items__uid__references_check_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReferenceStatusOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    refresh_reference_hashes_api_projects__project_id__items__uid__references_refresh_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReferenceOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    review_item_api_projects__project_id__items__uid__review_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_item_simulink_links_api_projects__project_id__items__uid__simulink_links_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimulinkSidecar"] | null;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_validation_api_projects__project_id__items__uid__validate_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ValidationCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ValidationCreateResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_validations_api_projects__project_id__items__uid__validations_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_latest_validation_api_projects__project_id__items__uid__validations_latest_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                uid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ValidationStatusResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_metrics_api_projects__project_id__metrics_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectMetrics"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_simulink_coverage_api_projects__project_id__simulink_coverage_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimulinkCoverage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    import_simulink_api_projects__project_id__simulink_import_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_import_simulink_api_projects__project_id__simulink_import_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimulinkImportResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_simulink_links_api_projects__project_id__simulink_links_delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_project_structure_api_projects__project_id__structure_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectStructureResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_traceability_api_projects__project_id__traceability_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TraceabilityData"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_all_validations_api_projects__project_id__validations_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_image_api_uploads_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_image_api_uploads_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_users_api_users_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserResponse"][];
                };
            };
        };
    };
    create_user_api_users_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_user_api_users__user_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_user_api_users__user_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_user_api_users__user_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
