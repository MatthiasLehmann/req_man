%% export_simulink_trace.m
%  Scannt ein Verzeichnis rekursiv nach allen Simulink-Modellen (.slx) und
%  MATLAB-Skripten (.m) und exportiert alle REQ-Links als JSON-Datei.
%
%  Verwendung:
%    >> export_simulink_trace
%         → scannt pwd, schreibt simulink_trace.json ins pwd
%
%    >> export_simulink_trace('C:/Projekte/MeinProjekt')
%         → scannt angegebenes Verzeichnis
%
%    >> export_simulink_trace('C:/Projekte/MeinProjekt', 'out/trace.json')
%         → scannt Verzeichnis, schreibt JSON an angegebenen Pfad
%
%  REQ-Format in Simulink (Block Description):
%    REQ: scorpos_icd-000001, scorpos_icd-000002
%
%  REQ-Format in .m-Dateien (Kommentar):
%    % REQ: scorpos_icd-000001

function export_simulink_trace(scan_dir, output_file)

    %% ── Konfiguration ────────────────────────────────────────────────────────
    ANNOTATION_FIELD = 'Description';
    REQ_PATTERN      = 'REQ:\s*([A-Za-z0-9,\s\-_]+)';

    if nargin < 1 || isempty(scan_dir)
        scan_dir = pwd;
    end
    if ~isfolder(scan_dir)
        error('export_simulink_trace: Verzeichnis nicht gefunden: %s', scan_dir);
    end
    if nargin < 2 || isempty(output_file)
        output_file = fullfile(scan_dir, 'simulink_trace.json');
    end

    fprintf('=== export_simulink_trace ===\n');
    fprintf('Verzeichnis : %s\n', scan_dir);
    fprintf('Ausgabe     : %s\n\n', output_file);

    links             = {};
    total_slx_blocks  = 0;
    sl_links_count    = 0;
    m_links_count     = 0;
    scanned_models    = {};

    %% ── Alle .slx/.mdl-Dateien finden und scannen ───────────────────────────
    slx_files = [dir(fullfile(scan_dir, '**', '*.slx')); ...
                 dir(fullfile(scan_dir, '**', '*.mdl'))];
    fprintf('Gefundene Modelle (.slx/.mdl): %d\n', numel(slx_files));

    for fi = 1:numel(slx_files)
        slx_path   = fullfile(slx_files(fi).folder, slx_files(fi).name);
        [~, model_name, ~] = fileparts(slx_files(fi).name);  % ohne .slx/.mdl

        fprintf('  [%d/%d] %s ... ', fi, numel(slx_files), model_name);

        was_loaded = bdIsLoaded(model_name);
        try
            if ~was_loaded
                load_system(slx_path);
            end
        catch loadErr
            fprintf('FEHLER beim Laden: %s\n', loadErr.message);
            continue;
        end

        try
            all_blocks     = find_system(model_name, ...
                'LookUnderMasks', 'all', ...
                'FollowLinks',    'on',  ...
                'MatchFilter',    @Simulink.match.allVariants);
            total_slx_blocks = total_slx_blocks + numel(all_blocks);

            model_links = 0;
            for bi = 1:numel(all_blocks)
                block_path = all_blocks{bi};
                try
                    description = get_param(block_path, ANNOTATION_FIELD);
                catch
                    continue;
                end
                if isempty(description); continue; end

                tokens = regexp(description, REQ_PATTERN, 'tokens', 'ignorecase');
                if isempty(tokens); continue; end

                uid_list = strsplit(tokens{1}{1}, ',');
                uid_list = cellfun(@strtrim, uid_list, 'UniformOutput', false);
                uid_list = uid_list(~cellfun(@isempty, uid_list));
                if isempty(uid_list); continue; end

                try
                    block_type = get_param(block_path, 'BlockType');
                catch
                    block_type = 'Unknown';
                end

                for j = 1:numel(uid_list)
                    entry.source_type = 'simulink';
                    entry.block_path  = block_path;
                    entry.block_type  = block_type;
                    entry.model_file  = slx_files(fi).name;   % z.B. Model.slx oder Model.mdl
                    entry.file        = slx_path;
                    entry.line        = [];
                    entry.uid         = uid_list{j};
                    entry.link_type   = 'implements';
                    links{end+1}      = entry; %#ok<AGROW>
                    model_links       = model_links + 1;
                end
            end

            sl_links_count = sl_links_count + model_links;
            scanned_models{end+1} = model_name; %#ok<AGROW>
            fprintf('%d Blöcke, %d Links\n', numel(all_blocks), model_links);

        catch scanErr
            fprintf('FEHLER beim Scannen: %s\n', scanErr.message);
        end

        if ~was_loaded
            try; close_system(model_name, 0); catch; end
        end
    end

    %% ── Alle .m-Dateien scannen ──────────────────────────────────────────────
    m_files = dir(fullfile(scan_dir, '**', '*.m'));
    fprintf('\nGefundene Skripte  (.m):  %d\n', numel(m_files));

    for fi = 1:numel(m_files)
        file_path = fullfile(m_files(fi).folder, m_files(fi).name);

        fid = fopen(file_path, 'r', 'n', 'UTF-8');
        if fid == -1; continue; end

        line_num = 0;
        while ~feof(fid)
            raw_line = fgetl(fid);
            line_num = line_num + 1;
            if ~ischar(raw_line); continue; end

            tokens = regexp(raw_line, REQ_PATTERN, 'tokens', 'ignorecase');
            if isempty(tokens); continue; end

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

    %% ── Zusammenfassung ──────────────────────────────────────────────────────
    fprintf('\n── Ergebnis ─────────────────────────────────\n');
    fprintf('  Modelle gescannt    : %d\n', numel(scanned_models));
    fprintf('  Simulink-Blöcke     : %d\n', total_slx_blocks);
    fprintf('  Simulink-Links      : %d\n', sl_links_count);
    fprintf('  .m-Dateien gescannt : %d\n', numel(m_files));
    fprintf('  .m-Links            : %d\n', m_links_count);
    fprintf('  Links gesamt        : %d\n', numel(links));

    %% ── JSON erzeugen ────────────────────────────────────────────────────────
    model_info.scan_dir       = scan_dir;
    model_info.name           = strjoin(scanned_models, ', ');
    model_info.models         = scanned_models;
    model_info.matlab_version = version;
    model_info.export_date    = datestr(now, 'yyyy-mm-ddTHH:MM:SS');
    model_info.total_blocks   = total_slx_blocks;
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

    fprintf('\nExport abgeschlossen → %s\n', output_file);
end
