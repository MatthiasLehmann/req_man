%% export_simulink_trace.m
%  Exportiert Simulink-Block-zu-Anforderung-Links UND MATLAB-.m-Datei-Links
%  als JSON-Datei.
%
%  Konfiguration:
%    MODEL_NAME       - Name des Simulink-Modells (ohne .slx)
%    OUTPUT_FILE      - Pfad der erzeugten JSON-Datei
%    ANNOTATION_FIELD - Block-Property, die die UIDs enthält ('Description')
%
%  Verwendung:
%    >> export_simulink_trace
%    >> export_simulink_trace('MeinModell', 'output/trace.json')
%    >> export_simulink_trace('MeinModell', 'output/trace.json', 'src/')
%
%  Format der Ausgabe:  siehe simulink-traceability-konzept1.md, Abschnitt 3

function export_simulink_trace(model_name, output_file, matlab_src_dir)

    %% ── Konfiguration ────────────────────────────────────────────────────────
    ANNOTATION_FIELD = 'Description';   % Alternativ: 'UserData' oder Mask-Parameter
    REQ_PREFIX       = 'REQ:';          % Präfix vor den UIDs

    if nargin < 1 || isempty(model_name)
        model_name = bdroot;
        if isempty(model_name)
            error('export_simulink_trace: Kein Modell ge\xf6ffnet.\nVerwendung: export_simulink_trace(''MeinModell'') oder zuerst ein Modell \xf6ffnen.');
        end
    end
    if nargin < 2 || isempty(output_file)
        output_file = fullfile(pwd, 'simulink_trace.json');
    end
    if nargin < 3 || isempty(matlab_src_dir)
        matlab_src_dir = pwd;           % Aktuelles Verzeichnis nach .m-Files durchsuchen
    end

    links = {};

    %% ── Simulink-Blöcke ──────────────────────────────────────────────────────
    fprintf('Lade Modell: %s\n', model_name);
    if ~bdIsLoaded(model_name)
        try
            load_system(model_name);
        catch loadErr
            % Hilfreiche Fehlermeldung mit Vorschlag geöffneter Modelle
            open_models = Simulink.allBlockDiagrams('model');
            if isempty(open_models)
                hint = 'Kein Modell ist aktuell geöffnet.';
            else
                names = cellfun(@(h) get_param(h,'Name'), num2cell(open_models), 'UniformOutput', false);
                hint  = ['Geöffnete Modelle: ' strjoin(names, ', ')];
            end
            error('export_simulink_trace: Modell ''%s'' konnte nicht geladen werden.\n%s\nOriginalfehler: %s', ...
                  model_name, hint, loadErr.message);
        end
        model_was_loaded = true;
    else
        model_was_loaded = false;
    end

    all_blocks = find_system(model_name, 'LookUnderMasks', 'all', 'FollowLinks', 'on', 'MatchFilter', @Simulink.match.allVariants);
    fprintf('  Gefundene Blöcke: %d\n', numel(all_blocks));

    skipped = 0;
    pattern = [REQ_PREFIX, '\s*([A-Za-z0-9,\s\-_]+)'];

    for i = 1:numel(all_blocks)
        block_path = all_blocks{i};

        try
            description = get_param(block_path, ANNOTATION_FIELD);
        catch
            skipped = skipped + 1;
            continue;
        end

        if isempty(description)
            continue;
        end

        tokens = regexp(description, pattern, 'tokens', 'ignorecase');
        if isempty(tokens)
            continue;
        end

        uid_list = strsplit(tokens{1}{1}, ',');
        uid_list = cellfun(@strtrim, uid_list, 'UniformOutput', false);
        uid_list = uid_list(~cellfun(@isempty, uid_list));

        if isempty(uid_list)
            continue;
        end

        try
            block_type = get_param(block_path, 'BlockType');
        catch
            block_type = 'Unknown';
        end

        for j = 1:numel(uid_list)
            entry.source_type = 'simulink';
            entry.block_path  = block_path;
            entry.block_type  = block_type;
            entry.model_file  = [model_name, '.slx'];
            entry.file        = [model_name, '.slx'];
            entry.line        = [];
            entry.uid         = uid_list{j};
            entry.link_type   = 'implements';
            links{end+1}      = entry; %#ok<AGROW>
        end
    end

    fprintf('  Verlinkte Simulink-Blöcke: %d (übersprungen: %d)\n', numel(links), skipped);

    %% ── MATLAB .m-Files ──────────────────────────────────────────────────────
    fprintf('Durchsuche .m-Files in: %s\n', matlab_src_dir);

    m_files = dir(fullfile(matlab_src_dir, '**', '*.m'));
    m_links_count = 0;

    for i = 1:numel(m_files)
        file_path = fullfile(m_files(i).folder, m_files(i).name);

        fid = fopen(file_path, 'r', 'n', 'UTF-8');
        if fid == -1
            continue;
        end

        line_num = 0;
        while ~feof(fid)
            line     = fgetl(fid);
            line_num = line_num + 1;

            if ~ischar(line)
                continue;
            end

            tokens = regexp(line, pattern, 'tokens', 'ignorecase');
            if isempty(tokens)
                continue;
            end

            uid_list = strsplit(tokens{1}{1}, ',');
            uid_list = cellfun(@strtrim, uid_list, 'UniformOutput', false);
            uid_list = uid_list(~cellfun(@isempty, uid_list));

            for j = 1:numel(uid_list)
                entry.source_type = 'matlab';
                entry.block_path  = '';
                entry.block_type  = '';
                entry.model_file  = '';
                entry.file        = file_path;
                entry.line        = line_num;
                entry.uid         = uid_list{j};
                entry.link_type   = 'implements';
                links{end+1}      = entry; %#ok<AGROW>
                m_links_count     = m_links_count + 1;
            end
        end

        fclose(fid);
    end

    fprintf('  Verlinkte .m-Stellen: %d (in %d Files)\n', m_links_count, numel(m_files));

    %% ── JSON erzeugen ────────────────────────────────────────────────────────
    model_info.name           = model_name;
    model_info.file           = [model_name, '.slx'];
    model_info.matlab_version = version;
    model_info.export_date    = datestr(now, 'yyyy-mm-ddTHH:MM:SS');
    model_info.total_blocks   = numel(all_blocks);
    model_info.linked_blocks  = numel(links);

    output.model = model_info;
    output.links = links;

    json_str = jsonencode(output, 'PrettyPrint', true);

    %% ── Datei schreiben ──────────────────────────────────────────────────────
    [out_dir, ~, ~] = fileparts(output_file);
    if ~isempty(out_dir) && ~exist(out_dir, 'dir')
        mkdir(out_dir);
    end

    fid = fopen(output_file, 'w', 'n', 'UTF-8');
    if fid == -1
        error('Konnte Datei nicht schreiben: %s', output_file);
    end
    fwrite(fid, json_str, 'char');
    fclose(fid);

    fprintf('Export abgeschlossen → %s\n', output_file);

    %% ── Aufräumen ────────────────────────────────────────────────────────────
    if model_was_loaded
        close_system(model_name, 0);
    end

end
