## requires packages
# conda install pandas openpyxl
# pip install Office365-REST-Python-Client

from office365.sharepoint.client_context import ClientContext
from office365.runtime.client_request_exception import ClientRequestException
import pandas as pd
from io import StringIO, BytesIO


# Used to create the context for connecting to sharepoint
def sharepoint_create_context(sp_site_url,
                              tenant="tris42.onmicrosoft.com",
                              client_id="d44a05d5-c6a5-4bbb-82d2-443123722380"
                              ):
    """
    Create a SharePoint client context.

    Args:
        sp_site_url (str): The URL of the SharePoint site.
        tenant (str, optional): The tenant ID. Defaults to "tris42.onmicrosoft.com".
        client_id (str, optional): The client ID. Defaults to "d44a05d5-c6a5-4bbb-82d2-443123722380".

    Returns:
        ClientContext: The SharePoint client context.
    """
    return ClientContext(sp_site_url).with_interactive(tenant=tenant, client_id=client_id)


# Gain info about the current user
def current_user(ctx):
    """
    Get information about the current user.

    Args:
        ctx (ClientContext): The SharePoint client context.

    Returns:
        dict: A dictionary containing the properties of the current user.
    """
    me = ctx.web.current_user.get().execute_query()
    return me.properties


# Gain info about web properites
def web_props(ctx):
    """
    Get information about web properties.

    Args:
        ctx (ClientContext): The SharePoint client context.

    Returns:
        dict: A dictionary containing the properties of the web.
    """
    web = ctx.web.get().execute_query()
    return web.properties


# Get current version number of specified file
def current_version(ctx, sp_file_url):
    """
    Get the current version number of a specified file.

    Args:
        ctx (ClientContext): The SharePoint client context.
        sp_file_url (str): The URL of the file.

    Returns:
        str: The current version of the file in format 'majorVersion.minorVersion'.
    """
    file = (
        ctx.web.get_file_by_server_relative_path(sp_file_url)
        .expand(["majorVersion", "minorVersion"])
        .get()
        .execute_query()
    )
    return str(file.major_version) + "." + str(file.minor_version)


# Gather version history (note it doesn't appear to get the current version
# just past versions!)
def fetch_version_history(ctx, sp_file_url):
    """
    Gather the version history of a specified file. Note that it doesn't get
    the current version, just past versions.

    Args:
        ctx (ClientContext): The SharePoint client context.
        sp_file_url (str): The URL of the file.

    Returns:
        list: A list containing the versions of the file.
    """
    return ctx.web.get_file_by_server_relative_path(sp_file_url).versions


# Print out versions in version list
def print_version_history(versions):
    """
    Print the version history of a file.

    Args:
        versions (list): A list containing the versions of the file.
    """
    for version in versions:
        print("Version Label: {0}, Created: {1}, Size: {2}, Comment: {3}".format(version.version_label,
                                                                                 version.created,
                                                                                 version._properties['Size'],
                                                                                 version._properties['CheckInComment']))


# Read version of csv file (defaults to current version)
def sharepoint_import_csv(ctx, sp_file_url, version_label="Current", custom_function=None):
    """
    Read a version of a csv file into a pandas DataFrame. If no version_label is
    specified, the current version is read.

    Args:
        ctx (ClientContext): The SharePoint client context.
        sp_file_url (str): The URL of the file.
        version_label (str, optional): The label of the version to read. Defaults to "Current".
        custom_function (func, optional): A custom read_csv function. Defaults to "None".

    Returns:
        DataFrame: A pandas DataFrame containing the data from the specified version of the csv file.
    """
    versions = fetch_version_history(ctx, sp_file_url)
    ctx.load(versions)
    ctx.execute_query()

    file_stream = BytesIO()

    current_ver = current_version(ctx, sp_file_url)

    if version_label == 'Current' or version_label == current_ver:
        ctx.web.get_file_by_server_relative_path(sp_file_url).download(file_stream).execute_query()
    else:
        # Find the specific version
        specific_version = None
        for version in versions:
            if version.version_label == version_label:
                specific_version = version.get().execute_query()

        if specific_version is None:
            print(f"Version {version_label} not found.")
            return None

        specific_version.download(file_stream).execute_query()

    out = file_stream.getvalue()
    file_stream.close()

    text_stream = StringIO(str(out, 'utf-8'))

    if custom_function == None:
        df = pd.read_csv(text_stream)
    else:
        df = custom_function(text_stream)

    text_stream.close()

    return df


# Read version of excel file (defaults to current version)
# If sheet set to None then will create dictionary of dataframes for each sheet in workbook
# This is the default behaviour
# Can speficy a specific sheet to get a single dataframe
# TODO: specify spcific range to import, list of sheet names to gather
def sharepoint_import_excel(ctx, sp_file_url, sheet=None, version_label="Current", custom_function=None):
    """
    Read a version of an excel file into a pandas DataFrame. If no version_label is specified, the current version is read.
    If sheet is set to None, a dictionary of DataFrames for each sheet in the workbook will be created.
    A specific sheet can be specified to get a single DataFrame.

    Args:
        ctx (ClientContext): The SharePoint client context.
        sp_file_url (str): The URL of the file.
        sheet (str, optional): The name of the sheet to read. If None, all sheets are read. Defaults to None.
        version_label (str, optional): The label of the version to read. Defaults to "Current".
        custom_function (func, optional): A custom read_csv function. Defaults to "None".
    Returns:
        DataFrame/dict: A pandas DataFrame containing the data from the specified version of the excel file.
                        If sheet is None, returns a dictionary of DataFrames for each sheet in the workbook.
    """
    versions = fetch_version_history(ctx, sp_file_url)
    ctx.load(versions)
    ctx.execute_query()

    file_stream = BytesIO()

    current_ver = current_version(ctx, sp_file_url)

    if version_label == 'Current' or version_label == current_ver:
        ctx.web.get_file_by_server_relative_path(sp_file_url).download(file_stream).execute_query()
    else:
        # Find the specific version
        specific_version = None
        for version in versions:
            if version.version_label == version_label:
                specific_version = version.get().execute_query()

        if specific_version is None:
            print(f"Version {version_label} not found.")
            return None

        specific_version.download(file_stream).execute_query()

    # If sheet is None then it will create a dictionary of DFs
    # Otherwise a single DF if a sheet name is specified
    if custom_function == None:
        try:
            df = pd.read_excel(file_stream, sheet_name=sheet)
        except Exception as e:
            print("Error creating dataframe...." + str(e))
            df = None
    else:
        try:
            df = custom_function(file_stream)
        except Exception as e:
            print("Error creating dataframe...." + str(e))
            df = None

    file_stream.close()

    return df


# Check folder existance
def sharepoint_folder_exists(ctx, sp_folder_name):
    """
    Check if a folder exists in SharePoint.

    Args:
        ctx (ClientContext): The SharePoint client context.
        sp_folder_name (str): The name of the SharePoint folder.

    Returns:
        bool: True if the folder exists, False otherwise.
    """
    try:
        ctx.web.get_folder_by_server_relative_url(sp_folder_name).get().execute_query()
        return True
    except ClientRequestException as e:
        if e.response.status_code == 404:
            return False
        else:
            raise ValueError(e.response.text)


# Check file existance
def sharepoint_file_exists(ctx, sp_folder_name, sp_file_name):
    """
    Check if a file exists in a SharePoint folder.

    Args:
        ctx (ClientContext): The SharePoint client context.
        sp_folder_name (str): The name of the SharePoint folder.
        sp_file_name (str): The name of the file.

    Returns:
        bool: True if the file exists, False otherwise.
    """
    try:
        ctx.web.get_file_by_server_relative_url(sp_folder_name + "/" + sp_file_name).get().execute_query()
        return True
    except ClientRequestException as e:
        if e.response.status_code == 404:
            return False
        else:
            raise ValueError(e.response.text)


# Export file to sharepoint (can be path to local file or a file-like object)
def sharepoint_export(ctx, sp_folder_name, sp_file_name, file_to_export):
    """
    Export a file to a SharePoint folder. The file to export can be a path to a local file or a file-like object.

    Args:
        ctx (ClientContext): The SharePoint client context.
        sp_folder_name (str): The name of the SharePoint folder.
        sp_file_name (str): The name of the file.
        file_to_export (str/File-like object): The path to the local file or a file-like object to be exported.

    Returns:
        bool: True if the file is successfully exported, False otherwise.
    """
    try:
        folder = ctx.web.get_folder_by_server_relative_url(sp_folder_name)
        if isinstance(file_to_export, str):
            with open(file_to_export, "rb") as f:
                file = folder.files.upload(f, sp_file_name).execute_query()
        else:
            file_to_export.seek(0)
            file = folder.files.upload(file_to_export, sp_file_name).execute_query()
        print("File has been uploaded into: {0}".format(file.serverRelativeUrl))
        return True
    except Exception as e:
        print(str(e))
        print("File upload failed!")
        return False


def sharepoint_export_df_to_csv(ctx, sp_folder_name, sp_file_name, df):
    """
    Export a pandas DataFrame to a csv file in a SharePoint folder.

    Args:
        ctx (ClientContext): The SharePoint client context.
        sp_folder_name (str): The name of the SharePoint folder.
        sp_file_name (str): The name of the file.
        df (DataFrame): The pandas DataFrame to be exported.

    Returns:
        bool: True if the DataFrame is successfully exported, False otherwise.
    """
    try:
        folder = ctx.web.get_folder_by_server_relative_url(sp_folder_name)
        # Convert DataFrame to CSV stored in a StringIO object
        string_io = StringIO()
        df.to_csv(string_io, index=False)
        string_io.seek(0)  # Move to the start of the StringIO object

        # Convert StringIO to BytesIO for binary data transfer
        bytes_io = BytesIO(string_io.getvalue().encode('utf-8'))

        file = folder.files.add(sp_file_name, bytes_io, True).execute_query()
        print("File has been uploaded into: {0}".format(file.serverRelativeUrl))
        return True
    except Exception as e:
        print("File upload failed: {0}".format(str(e)))
        return False


def sharepoint_delete_file(ctx, sp_file_url, recycle=False):
    """
    Delete (or recycle) a file in SharePoint.

    Args:
        ctx (ClientContext): SharePoint client context.
        sp_file_url (str): Server‑relative URL of the file (e.g.
                           "/sites/Example/Shared Documents/foo/bar.csv").
        recycle (bool, optional): If True, send to recycle bin;
                                  if False, delete permanently.
                                  Defaults to True.

    Returns:
        bool: True if the operation succeeded, False otherwise.
    """
    try:
        sp_file = ctx.web.get_file_by_server_relative_path(sp_file_url)
        if recycle:
            sp_file.recycle()  # goes to site recycle‑bin
        else:
            sp_file.delete_object()  # hard delete
        ctx.execute_query()
        return True
    except ClientRequestException as e:
        if e.response.status_code == 404:
            print(f"File not found: {sp_file_url}")
            return False
        raise ValueError(e.response.text)
    except Exception as e:
        print(f"File delete failed: {e}")
        return False


def sharepoint_delete_file_by_path(ctx,
                                   sp_folder_name: str,
                                   sp_file_name: str,
                                   recycle: bool = True) -> bool:
    """
    Delete (or recycle) a file given *folder* + *file name*.

    Args:
        ctx              : SharePoint ClientContext.
        sp_folder_name   : Server‑relative folder path
                           (e.g. "/sites/Example/Shared Documents/reports").
        sp_file_name     : File name only (e.g. "foo.csv").
        recycle (bool)   : True → move to recycle bin; False → hard delete.

    Returns:
        bool             : True on success, False on failure / not found.
    """
    sp_file_url = f"{sp_folder_name.rstrip('/')}/{sp_file_name}".replace("//", "/")
    return sharepoint_delete_file(ctx, sp_file_url, recycle)


# Create folder
def sharepoint_create_folder(ctx, sp_folder_name):
    """
    Create a SharePoint folder.

    Args:
        ctx (ClientContext): The SharePoint client context.
        sp_folder_name (str): The name of the SharePoint folder to be created.

    Returns:
        bool: True if the folder is successfully created or already exists, False otherwise.
    """
    try:
        ctx.web.folders.add(sp_folder_name)
        ctx.execute_query()
    except:
        pass
    return sharepoint_folder_exists(ctx, sp_folder_name)
